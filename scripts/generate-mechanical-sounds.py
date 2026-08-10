#!/usr/bin/env python3
"""Generate original, short mechanical UI foley samples.

The sounds are intentionally synthetic-but-physical: damped resonances, a low
chassis thump, and very short filtered contact noise. They are generated into
public/audio so the browser can preload and replay them without a dependency or
licensing burden.
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 44_100
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "audio"


def envelope(t: float, attack: float, decay: float) -> float:
    rise = min(1.0, t / max(attack, 1e-5))
    return rise * math.exp(-t / decay)


def impulse(t: float, start: float, decay: float) -> float:
    if t < start:
        return 0.0
    return math.exp(-(t - start) / decay)


def render(name: str, duration: float, kind: str, seed: int) -> None:
    rng = random.Random(seed)
    sample_count = int(SAMPLE_RATE * duration)
    values: list[float] = []
    smoothed_noise = 0.0

    for index in range(sample_count):
        t = index / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        smoothed_noise = smoothed_noise * 0.64 + noise * 0.36

        if kind == "switch_down":
            click = impulse(t, 0.002, 0.006) * (
                math.sin(2 * math.pi * 2_350 * t) * 0.34
                + smoothed_noise * 0.42
            )
            body = envelope(t, 0.001, 0.032) * (
                math.sin(2 * math.pi * 142 * t) * 0.42
                + math.sin(2 * math.pi * 680 * t) * 0.16
            )
            value = click + body
        elif kind == "switch_up":
            first = impulse(t, 0.001, 0.005) * (
                math.sin(2 * math.pi * 1_850 * t) * 0.27
                + smoothed_noise * 0.35
            )
            latch = impulse(t, 0.018, 0.009) * (
                math.sin(2 * math.pi * 920 * (t - 0.018)) * 0.31
                + math.sin(2 * math.pi * 220 * (t - 0.018)) * 0.2
            )
            value = first + latch
        elif kind == "transport_down":
            thump = envelope(t, 0.001, 0.055) * (
                math.sin(2 * math.pi * 91 * t) * 0.62
                + math.sin(2 * math.pi * 270 * t) * 0.22
            )
            metal = impulse(t, 0.004, 0.012) * (
                math.sin(2 * math.pi * 1_460 * t) * 0.28
                + smoothed_noise * 0.27
            )
            stop = impulse(t, 0.041, 0.014) * math.sin(2 * math.pi * 520 * (t - 0.041)) * 0.2
            value = thump + metal + stop
        else:
            spring = envelope(t, 0.001, 0.045) * (
                math.sin(2 * math.pi * 132 * t) * 0.42
                + math.sin(2 * math.pi * 740 * t) * 0.18
            )
            catch = impulse(t, 0.025, 0.01) * (
                math.sin(2 * math.pi * 1_260 * (t - 0.025)) * 0.25
                + smoothed_noise * 0.2
            )
            value = spring + catch

        # Short fade prevents end clicks while keeping the leading transient.
        fade = min(1.0, (duration - t) / 0.012)
        values.append(value * max(0.0, fade))

    peak = max(abs(value) for value in values) or 1.0
    gain = 0.88 / peak
    pcm = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, value * gain)) * 32767)) for value in values)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT_DIR / name), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm)


def main() -> None:
    render("switch-down.wav", 0.075, "switch_down", 31)
    render("switch-up.wav", 0.105, "switch_up", 47)
    render("transport-down.wav", 0.145, "transport_down", 73)
    render("transport-up.wav", 0.12, "transport_up", 89)


if __name__ == "__main__":
    main()
