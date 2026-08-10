import assert from "node:assert/strict";
import test from "node:test";
import { readClientSseStream } from "../../src/lib/api.js";

test("browser SSE parser dispatches split event frames and returns completion", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: delta\ndata: {"text":"你'));
      controller.enqueue(encoder.encode('好"}\n\nevent: complete\ndata: {"item":{"id":"audio-1"},'));
      controller.enqueue(encoder.encode('"transcript":"你好"}\n\n'));
      controller.close();
    },
  });
  const deltas: string[] = [];
  const completed = await readClientSseStream(stream, {
    delta: ({ text }: { text: string }) => deltas.push(text),
  });
  assert.deepEqual(deltas, ["你好"]);
  assert.equal(completed.item.id, "audio-1");
  assert.equal(completed.transcript, "你好");
});

test("browser SSE parser surfaces server error events", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: error\ndata: {"error":"upstream rejected"}\n\n'));
      controller.close();
    },
  });
  await assert.rejects(readClientSseStream(stream), /upstream rejected/);
});
