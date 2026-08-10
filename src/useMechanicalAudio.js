import { useCallback, useEffect, useRef } from "react";

const soundFiles = {
  switchDown: `${import.meta.env.BASE_URL}audio/switch-down.wav`,
  switchUp: `${import.meta.env.BASE_URL}audio/switch-up.wav`,
  transportDown: `${import.meta.env.BASE_URL}audio/transport-down.wav`,
  transportUp: `${import.meta.env.BASE_URL}audio/transport-up.wav`,
};

const soundVolume = {
  switchDown: 0.24,
  switchUp: 0.2,
  transportDown: 0.34,
  transportUp: 0.28,
};

export function useMechanicalAudio(enabled = true) {
  const poolsRef = useRef(new Map());
  const cursorRef = useRef(new Map());

  useEffect(() => {
    const pools = new Map();
    Object.entries(soundFiles).forEach(([name, source]) => {
      const pool = Array.from({ length: 4 }, () => {
        const audio = new Audio(source);
        audio.preload = "auto";
        audio.load();
        return audio;
      });
      pools.set(name, pool);
    });
    poolsRef.current = pools;

    return () => {
      pools.forEach((pool) => pool.forEach((audio) => {
        audio.pause();
        audio.removeAttribute("src");
      }));
    };
  }, []);

  return useCallback((name, options = {}) => {
    if (!enabled) return;
    const pool = poolsRef.current.get(name);
    if (!pool?.length) return;

    const nextIndex = (cursorRef.current.get(name) || 0) % pool.length;
    cursorRef.current.set(name, nextIndex + 1);
    const audio = pool[nextIndex];
    audio.pause();
    audio.currentTime = 0;
    audio.volume = options.volume ?? soundVolume[name] ?? 0.25;
    audio.playbackRate = options.playbackRate ?? (0.985 + Math.random() * 0.03);
    audio.play().catch(() => {});
  }, [enabled]);
}
