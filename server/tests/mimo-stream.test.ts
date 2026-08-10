import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { generateSpeechStream, readSseJsonStream, transcribeAudioStream } from "../mimo.js";

async function withMockMimo<T>(frames: string[], run: (baseUrl: string, requestBody: any) => Promise<T>) {
  let requestBody: any = null;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      frames.forEach((frame) => response.write(frame));
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock server failed to bind");
  try {
    return await run(`http://127.0.0.1:${address.port}`, requestBody);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("SSE parser joins frames split across transport chunks", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"choices":[{"delta":{"content":"你',
    '好"}}]}\n\n',
    'data: {"usage":{"total_tokens":3}}\r\n\r\n',
    'data: [DONE]\n\n',
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  const events: any[] = [];
  await readSseJsonStream(stream, (event) => events.push(event));
  assert.equal(events[0].choices[0].delta.content, "你好");
  assert.equal(events[1].usage.total_tokens, 3);
  assert.equal(events.length, 2);
});

test("SSE parser supports multi-line data payloads", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":\n'));
      controller.enqueue(encoder.encode('data: [{"delta":{"content":"ok"}}]}\n\n'));
      controller.close();
    },
  });
  const events: any[] = [];
  await readSseJsonStream(stream, (event) => events.push(event));
  assert.equal(events[0].choices[0].delta.content, "ok");
});

test("streaming TTS forwards PCM16 chunks and packages the final WAV", async () => {
  const pcmA = Buffer.from([0x00, 0x00, 0xff, 0x7f]);
  const pcmB = Buffer.from([0x00, 0x80, 0x00, 0x00]);
  const frames = [
    `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcmA.toString("base64") } } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcmB.toString("base64") }, final_text_preview: "测试" } }], usage: { total_tokens: 8 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const seen: string[] = [];
  await withMockMimo(frames, async (baseUrl) => {
    const result = await generateSpeechStream({ apiKey: "test-key", baseUrl, text: "测试", voice: "mimo_default" }, (chunk) => seen.push(chunk));
    assert.deepEqual(seen, [pcmA.toString("base64"), pcmB.toString("base64")]);
    assert.equal(result.audio.subarray(0, 4).toString(), "RIFF");
    assert.equal(result.audio.subarray(8, 12).toString(), "WAVE");
    assert.equal(result.audio.readUInt32LE(40), pcmA.byteLength + pcmB.byteLength);
    assert.equal(result.usage.total_tokens, 8);
    assert.equal(result.finalTextPreview, "测试");
  });
});

test("streaming ASR emits incremental text and returns the assembled transcript", async () => {
  const frames = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: "你" } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: "好" } }], usage: { total_tokens: 5 } })}\n\n`,
    "data: [DONE]\n\n",
  ];
  const seen: string[] = [];
  await withMockMimo(frames, async (baseUrl) => {
    const result = await transcribeAudioStream({ apiKey: "test-key", baseUrl, audio: new Uint8Array([1, 2, 3]), mimeType: "audio/wav", language: "zh" }, (delta) => seen.push(delta));
    assert.deepEqual(seen, ["你", "好"]);
    assert.equal(result.text, "你好");
    assert.equal(result.usage.total_tokens, 5);
  });
});
