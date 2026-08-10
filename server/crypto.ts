import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

function aad(userId: string, provider: string, version: number) {
  return Buffer.from(`mimo-studio:${userId}:${provider}:v${version}`, "utf8");
}

export function encryptCredential(value: string, userId: string, provider = "mimo") {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, env.encryptionKey, iv);
  cipher.setAAD(aad(userId, provider, KEY_VERSION));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: KEY_VERSION };
}

export function decryptCredential(record: { ciphertext: Buffer; iv: Buffer; auth_tag: Buffer; key_version: number }, userId: string, provider = "mimo") {
  if (record.key_version !== KEY_VERSION) throw new Error("Unsupported credential key version");
  const decipher = createDecipheriv(ALGORITHM, env.encryptionKey, record.iv);
  decipher.setAAD(aad(userId, provider, record.key_version));
  decipher.setAuthTag(record.auth_tag);
  return Buffer.concat([decipher.update(record.ciphertext), decipher.final()]).toString("utf8");
}

