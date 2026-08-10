import assert from "node:assert/strict";
import test from "node:test";
import { decryptCredential, encryptCredential } from "../crypto.js";

test("credential encryption round-trips without storing plaintext", () => {
  const plaintext = "mimo-test-secret-1234567890";
  const userId = "user-crypto-test";
  const encrypted = encryptCredential(plaintext, userId);
  assert.notEqual(encrypted.ciphertext.toString("utf8"), plaintext);
  assert.equal(encrypted.iv.byteLength, 12);
  assert.equal(encrypted.authTag.byteLength, 16);
  assert.equal(decryptCredential({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion }, userId), plaintext);
});

test("credential ciphertext is bound to the owning user", () => {
  const encrypted = encryptCredential("mimo-test-secret-abcdefgh", "owner-a");
  assert.throws(() => decryptCredential({ ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag, key_version: encrypted.keyVersion }, "owner-b"));
});

