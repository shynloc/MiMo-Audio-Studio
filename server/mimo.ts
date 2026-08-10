import { env } from "./env.js";

type TtsInput = {
  apiKey: string;
  baseUrl: string;
  text: string;
  voice?: string;
  format: "wav" | "mp3" | "pcm16";
  model?: "mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign" | "mimo-v2.5-tts-voiceclone";
  style?: string;
  optimizeTextPreview?: boolean;
};

type AsrInput = { apiKey: string; baseUrl: string; audio: Uint8Array; mimeType: string; language?: string; signal?: AbortSignal };
type StreamTtsInput = Omit<TtsInput, "format" | "model"> & { format?: "pcm16"; model?: "mimo-v2.5-tts"; signal?: AbortSignal };
type TimedTtsInput = Omit<TtsInput, "format"> & { format: "wav" | "mp3" | "pcm16"; targetDuration: number; maxIterations?: number; tolerance?: number };

async function mimoRequest(apiKey: string, baseUrl: string, body: unknown) {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(new Error("MiMo request timed out")), env.MIMO_TOTAL_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!response.ok) {
      const upstreamMessage = data?.error?.message || `MiMo request failed (${response.status})`;
      const error = new Error(upstreamMessage) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (!data) throw new Error("MiMo returned an unreadable response");
    return data;
  } finally {
    clearTimeout(totalTimer);
  }
}

export async function readSseJsonStream(stream: ReadableStream<Uint8Array>, onData: (data: any) => void | Promise<void>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  const consume = async (block: string) => {
    const payload = block.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!payload) return;
    if (payload === "[DONE]") { done = true; return; }
    try { await onData(JSON.parse(payload)); }
    catch (error) { if (error instanceof SyntaxError) throw new Error("MiMo returned an invalid streaming event"); throw error; }
  };

  try {
    while (!done) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match && !done) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        await consume(block);
        match = /\r?\n\r?\n/.exec(buffer);
      }
      if (result.done) break;
    }
    if (!done && buffer.trim()) await consume(buffer);
  } finally {
    reader.releaseLock();
  }
}

async function mimoStreamRequest(apiKey: string, baseUrl: string, body: unknown, onData: (data: any) => void | Promise<void>, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(externalSignal?.reason || new Error("Request cancelled"));
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const totalTimer = setTimeout(() => controller.abort(new Error("MiMo request timed out")), env.MIMO_TOTAL_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text();
      let data: any;
      try { data = JSON.parse(raw); } catch { data = null; }
      const error = new Error(data?.error?.message || `MiMo request failed (${response.status})`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    if (!response.body) throw new Error("MiMo returned no streaming body");
    await readSseJsonStream(response.body, onData);
  } finally {
    clearTimeout(totalTimer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function pcm16ToWav(pcm: Uint8Array, sampleRate = 24000) {
  const output = Buffer.allocUnsafe(44 + pcm.byteLength);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + pcm.byteLength, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(pcm.byteLength, 40);
  Buffer.from(pcm).copy(output, 44);
  return output;
}

export async function generateSpeech(input: TtsInput) {
  const messages: Array<{ role: string; content: string }> = [];
  if (input.style?.trim()) messages.push({ role: "user", content: input.style.trim() });
  messages.push({ role: "assistant", content: input.text });
  const audioOptions: Record<string, unknown> = { format: input.format };
  if (input.voice) audioOptions.voice = input.voice;
  if (input.model === "mimo-v2.5-tts-voicedesign" && input.optimizeTextPreview !== undefined) {
    audioOptions.optimize_text_preview = input.optimizeTextPreview;
  }
  const data = await mimoRequest(input.apiKey, input.baseUrl, {
    model: input.model || "mimo-v2.5-tts",
    messages,
    audio: audioOptions,
  });
  const encoded = data?.choices?.[0]?.message?.audio?.data;
  if (typeof encoded !== "string" || !encoded) throw new Error("MiMo returned no audio data");
  let audio = Buffer.from(encoded, "base64");
  let format = input.format;
  if (input.format === "pcm16") {
    audio = pcm16ToWav(audio);
    format = "wav";
  }
  if (audio.byteLength > env.MAX_AUDIO_BYTES) throw new Error("Generated audio exceeds the storage limit");
  return { audio, format, mimeType: format === "mp3" ? "audio/mpeg" : "audio/wav", usage: data.usage ?? null };
}

export async function generateSpeechStream(input: StreamTtsInput, onAudio: (base64Audio: string) => void | Promise<void>, onTextPreview?: (text: string) => void | Promise<void>) {
  const messages: Array<{ role: string; content: string }> = [];
  if (input.style?.trim()) messages.push({ role: "user", content: input.style.trim() });
  messages.push({ role: "assistant", content: input.text });
  const pcmChunks: Buffer[] = [];
  let usage: any = null;
  let finalTextPreview = "";
  await mimoStreamRequest(input.apiKey, input.baseUrl, {
    model: "mimo-v2.5-tts",
    messages,
    audio: { format: "pcm16", voice: input.voice || "mimo_default" },
    stream: true,
  }, async (chunk) => {
    const encoded = chunk?.choices?.[0]?.delta?.audio?.data;
    if (typeof encoded === "string" && encoded) {
      const pcm = Buffer.from(encoded, "base64");
      if (pcm.byteLength) {
        pcmChunks.push(pcm);
        await onAudio(encoded);
      }
    }
    const preview = chunk?.choices?.[0]?.delta?.final_text_preview;
    if (typeof preview === "string" && preview) {
      finalTextPreview += preview;
      await onTextPreview?.(preview);
    }
    if (chunk?.usage) usage = chunk.usage;
  }, input.signal);
  if (!pcmChunks.length) throw new Error("MiMo returned no streaming audio data");
  const pcm = Buffer.concat(pcmChunks);
  const audio = pcm16ToWav(pcm);
  if (audio.byteLength > env.MAX_AUDIO_BYTES) throw new Error("Generated audio exceeds the storage limit");
  return { audio, format: "wav" as const, mimeType: "audio/wav", usage, finalTextPreview, measuredDuration: Number((pcm.byteLength / 48_000).toFixed(3)) };
}

function wavDuration(audio: Uint8Array) {
  if (audio.byteLength < 44) return 0;
  const view = Buffer.from(audio);
  const byteRate = view.readUInt32LE(28);
  const dataBytes = view.readUInt32LE(40);
  return byteRate > 0 ? dataBytes / byteRate : 0;
}

function speedInstruction(ratio: number) {
  if (ratio < 0.5) return "请用极慢语速，约每秒2字";
  if (ratio < 0.7) return "请用较慢语速，约每秒3字";
  if (ratio < 0.85) return "请用稍慢语速，约每秒3.5字";
  if (ratio <= 1.15) return "请用自然的正常语速";
  if (ratio <= 1.35) return "请用稍快语速，约每秒5.5字";
  if (ratio <= 1.6) return "请用较快语速，约每秒6.5字";
  if (ratio <= 2) return "请用很快语速，约每秒7.5字";
  return "请用极快语速，约每秒9字";
}

export async function generateTimedSpeech(input: TimedTtsInput) {
  const maxIterations = Math.min(4, Math.max(1, input.maxIterations || 3));
  const tolerance = Math.max(0.25, input.tolerance || 2);
  const targetRate = input.text.length / input.targetDuration;
  let ratio = targetRate / 4.5;
  let best: Awaited<ReturnType<typeof generateSpeech>> | null = null;
  let bestDuration = 0;
  let bestInstruction = "";
  const iterations: Array<{ duration: number; difference: number }> = [];

  for (let index = 0; index < maxIterations; index += 1) {
    const instruction = `${speedInstruction(ratio)}。目标总时长约 ${input.targetDuration} 秒。${input.style || ""}`;
    const output = await generateSpeech({ ...input, format: "wav", style: instruction });
    const duration = wavDuration(output.audio);
    if (!duration) throw new Error("Unable to measure generated audio duration");
    iterations.push({ duration: Number(duration.toFixed(3)), difference: Number((duration - input.targetDuration).toFixed(3)) });
    if (!best || Math.abs(duration - input.targetDuration) < Math.abs(bestDuration - input.targetDuration)) {
      best = output;
      bestDuration = duration;
      bestInstruction = instruction;
    }
    if (Math.abs(duration - input.targetDuration) <= tolerance) break;
    ratio *= input.targetDuration / duration;
  }

  if (!best) throw new Error("Timed generation produced no audio");
  if (input.format === "mp3") best = await generateSpeech({ ...input, format: "mp3", style: bestInstruction });
  return { ...best, measuredDuration: Number(bestDuration.toFixed(3)), iterations };
}

export async function transcribeAudio(input: AsrInput) {
  if (input.audio.byteLength > env.MAX_AUDIO_BYTES) throw new Error("Uploaded audio exceeds the size limit");
  const data = await mimoRequest(input.apiKey, input.baseUrl, {
    model: "mimo-v2.5-asr",
    messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${input.mimeType};base64,${Buffer.from(input.audio).toString("base64")}` } }] }],
    asr_options: { language: input.language || "auto" },
    stream: false,
  });
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("MiMo returned no transcription");
  return { text, usage: data.usage ?? null };
}

export async function transcribeAudioStream(input: AsrInput, onDelta: (text: string) => void | Promise<void>) {
  if (input.audio.byteLength > env.MAX_AUDIO_BYTES) throw new Error("Uploaded audio exceeds the size limit");
  let text = "";
  let usage: any = null;
  await mimoStreamRequest(input.apiKey, input.baseUrl, {
    model: "mimo-v2.5-asr",
    messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${input.mimeType};base64,${Buffer.from(input.audio).toString("base64")}` } }] }],
    asr_options: { language: input.language || "auto" },
    stream: true,
  }, async (chunk) => {
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      text += delta;
      await onDelta(delta);
    }
    if (chunk?.usage) usage = chunk.usage;
  }, input.signal);
  if (!text) throw new Error("MiMo returned no transcription");
  return { text, usage };
}

export async function validateMimoKey(apiKey: string, baseUrl: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.MIMO_CONNECT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers: { "api-key": apiKey }, signal: controller.signal });
    if (response.ok) return true;
    if (response.status === 404 || response.status === 405) return null;
    return false;
  } finally {
    clearTimeout(timer);
  }
}
