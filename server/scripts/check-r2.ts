import { randomUUID } from "node:crypto";
import { deleteAudioObject, putAudioObject, signedAudioUrl } from "../r2.js";

const key = `.codex-health/${randomUUID()}.txt`;

async function check() {
  try {
    await putAudioObject(key, Buffer.from("mimo-r2-check", "utf8"), "text/plain", { purpose: "connectivity-check" });
    const url = await signedAudioUrl(key, "inline", "health.txt");
    const response = await fetch(url);
    if (!response.ok || await response.text() !== "mimo-r2-check") throw new Error(`Signed read failed (${response.status})`);
    console.log("R2 write, signed read, and cleanup check passed");
  } finally {
    await deleteAudioObject(key).catch(() => undefined);
  }
}

check().catch((error) => { console.error("R2 check failed:", error.message); process.exitCode = 1; });

