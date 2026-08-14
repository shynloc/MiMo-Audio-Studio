import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { auth } from "./auth.js";
import { decryptCredential, encryptCredential } from "./crypto.js";
import { checkDatabase, pool } from "./db.js";
import { env } from "./env.js";
import { generateSpeech, generateSpeechStream, generateTimedSpeech, transcribeAudio, transcribeAudioStream, validateMimoKey } from "./mimo.js";
import { checkR2, deleteAudioObject, getAudioObject, putAudioObject } from "./r2.js";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type Variables = { session: Session };
const rootApp = new Hono<{ Variables: Variables }>();
const app = env.appBasePath ? rootApp.basePath(env.appBasePath) : rootApp;
const generationWindows = new Map<string, number[]>();

app.use("*", secureHeaders());
app.use("*", cors({
  origin: (origin) => env.trustedOrigins.includes(origin) ? origin : undefined,
  credentials: true,
  allowHeaders: ["Content-Type", "X-Requested-With"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

app.use("/api/*", async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const origin = c.req.header("Origin");
  if (origin && !env.trustedOrigins.includes(origin)) return c.json({ error: "Origin not allowed" }, 403);
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/health", async (c) => {
  try {
    await checkDatabase();
    const storage = env.r2Configured ? (await checkR2() ? "ready" : "unavailable") : "not-configured";
    return c.json({ ok: storage !== "unavailable", database: "ready", storage }, storage === "unavailable" ? 503 : 200);
  } catch {
    return c.json({ ok: false, database: "unavailable", storage: env.r2Configured ? "configured" : "not-configured" }, 503);
  }
});

app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Authentication required" }, 401);
  c.set("session", session);
  await next();
});

app.use("/api/generate/*", async (c, next) => {
  const userId = c.get("session").user.id;
  const now = Date.now();
  const recent = (generationWindows.get(userId) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 6) return c.json({ error: "Too many generation requests; wait one minute" }, 429);
  recent.push(now);
  generationWindows.set(userId, recent);
  await next();
});

app.use("/api/admin/*", async (c, next) => {
  const user = c.get("session").user as Session["user"] & { role?: string };
  if (user.role !== "admin") return c.json({ error: "Administrator access required" }, 403);
  await next();
});

app.get("/api/me", (c) => {
  const user = c.get("session").user as Session["user"] & { role?: string };
  return c.json({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified, role: user.role || "user" });
});

const credentialSchema = z.object({
  apiKey: z.string().trim().min(12).max(4096).optional(),
  baseUrl: z.string().trim().url().max(500),
});

app.get("/api/credentials/mimo", async (c) => {
  const userId = c.get("session").user.id;
  const [result, endpointResult] = await Promise.all([
    pool.query("select last_four, api_base_url, updated_at from api_credentials where user_id = $1 and provider = 'mimo'", [userId]),
    pool.query("select id, name, base_url, is_system from api_endpoints where enabled = true order by is_system desc, created_at asc"),
  ]);
  const row = result.rows[0];
  return c.json({
    configured: Boolean(row),
    lastFour: row?.last_four ?? null,
    baseUrl: row?.api_base_url ?? env.MIMO_API_BASE_URL,
    updatedAt: row?.updated_at ?? null,
    endpoints: endpointResult.rows.map(serializeEndpoint),
  });
});

app.put("/api/credentials/mimo", async (c) => {
  const parsed = credentialSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "API Key or Base URL format is invalid" }, 400);
  const userId = c.get("session").user.id;
  let baseUrl: string;
  try { baseUrl = await requireEnabledEndpoint(parsed.data.baseUrl); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : "API endpoint is invalid" }, (error as Error & { status?: number }).status === 403 ? 403 : 400); }
  const current = await loadMimoConfig(userId);
  if (!parsed.data.apiKey && !current) return c.json({ error: "API Key is required for the first save" }, 400);
  if (parsed.data.apiKey) {
    const encrypted = encryptCredential(parsed.data.apiKey, userId);
    await pool.query(`
      insert into api_credentials (user_id, provider, ciphertext, iv, auth_tag, key_version, last_four, api_base_url)
      values ($1, 'mimo', $2, $3, $4, $5, $6, $7)
      on conflict (user_id, provider) do update set
        ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag,
        key_version = excluded.key_version, last_four = excluded.last_four,
        api_base_url = excluded.api_base_url, updated_at = now()
    `, [userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyVersion, parsed.data.apiKey.slice(-4), baseUrl]);
  } else {
    await pool.query("update api_credentials set api_base_url = $2, updated_at = now() where user_id = $1 and provider = 'mimo'", [userId, baseUrl]);
  }
  return c.json({ configured: true, lastFour: parsed.data.apiKey?.slice(-4) ?? current?.lastFour, baseUrl });
});

app.post("/api/credentials/mimo/test", async (c) => {
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "MiMo API Key is not configured" }, 409);
  try {
    const result = await validateMimoKey(config.apiKey, config.baseUrl);
    if (result === false) return c.json({ ok: false, message: "MiMo rejected this key" }, 400);
    return c.json({ ok: true, verified: result === true, message: result === true ? "MiMo connection verified" : "Key is stored; MiMo has no lightweight validation endpoint" });
  } catch {
    return c.json({ ok: false, message: "Unable to reach MiMo" }, 502);
  }
});

app.delete("/api/credentials/mimo", async (c) => {
  const userId = c.get("session").user.id;
  await pool.query("delete from api_credentials where user_id = $1 and provider = 'mimo'", [userId]);
  return c.body(null, 204);
});

app.get("/api/admin/overview", async (c) => {
  const [users, audio, jobs, failed, endpoints] = await Promise.all([
    pool.query("select count(*)::int as count from \"user\""),
    pool.query("select count(*)::int as count from audio_assets where deleted_at is null"),
    pool.query("select count(*)::int as count from generation_jobs"),
    pool.query("select count(*)::int as count from generation_jobs where status = 'failed'"),
    pool.query("select count(*)::int as count from api_endpoints where enabled = true"),
  ]);
  const storageReady = env.r2Configured ? await checkR2().catch(() => false) : false;
  return c.json({
    counts: { users: users.rows[0].count, audio: audio.rows[0].count, jobs: jobs.rows[0].count, failed: failed.rows[0].count, endpoints: endpoints.rows[0].count },
    health: { database: "ready", storage: storageReady ? "ready" : env.r2Configured ? "unavailable" : "not-configured" },
  });
});

app.get("/api/admin/users", async (c) => {
  const result = await pool.query(`
    select id, name, email, "emailVerified", coalesce(role, 'user') as role,
      coalesce(banned, false) as banned, "createdAt"
    from "user" order by "createdAt" desc limit 250
  `);
  return c.json({ items: result.rows.map((row) => ({ id: row.id, name: row.name, email: row.email, emailVerified: row.emailVerified, role: row.role, banned: row.banned, createdAt: row.createdAt })) });
});

const roleSchema = z.object({ role: z.enum(["user", "admin"]) });
app.put("/api/admin/users/:id/role", async (c) => {
  const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Role is invalid" }, 400);
  const targetId = c.req.param("id");
  if (parsed.data.role === "user") {
    const adminCount = await pool.query("select count(*)::int as count from \"user\" where role = 'admin'");
    if (adminCount.rows[0].count <= 1) return c.json({ error: "The last administrator cannot be demoted" }, 409);
  }
  const result = await pool.query("update \"user\" set role = $2, \"updatedAt\" = now() where id = $1 returning id, role", [targetId, parsed.data.role]);
  if (!result.rowCount) return c.json({ error: "User not found" }, 404);
  return c.json(result.rows[0]);
});

app.get("/api/admin/endpoints", async (c) => {
  const result = await pool.query("select id, name, base_url, enabled, is_system, created_at from api_endpoints order by is_system desc, created_at asc");
  return c.json({ items: result.rows.map(serializeEndpoint) });
});

const endpointCreateSchema = z.object({ name: z.string().trim().min(2).max(80), baseUrl: z.string().trim().url().max(500) });
app.post("/api/admin/endpoints", async (c) => {
  const parsed = endpointCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Endpoint name or URL is invalid" }, 400);
  let baseUrl: string;
  try { baseUrl = normalizeBaseUrl(parsed.data.baseUrl); assertPublicHttpsUrl(baseUrl); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : "Endpoint URL is invalid" }, 400); }
  const result = await pool.query(`
    insert into api_endpoints (name, base_url, enabled, is_system, created_by)
    values ($1, $2, true, false, $3)
    on conflict (base_url) do update set name = excluded.name, enabled = true, updated_at = now()
    returning *
  `, [parsed.data.name, baseUrl, c.get("session").user.id]);
  return c.json(serializeEndpoint(result.rows[0]), 201);
});

const endpointUpdateSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), enabled: z.boolean().optional() });
app.put("/api/admin/endpoints/:id", async (c) => {
  const parsed = endpointUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.enabled === undefined)) return c.json({ error: "Endpoint update is invalid" }, 400);
  if (parsed.data.enabled === false) {
    const inUse = await pool.query("select count(*)::int as count from api_credentials where api_base_url = (select base_url from api_endpoints where id = $1)", [c.req.param("id")]);
    if (inUse.rows[0].count > 0) return c.json({ error: "Endpoint is still assigned to user credentials" }, 409);
  }
  const result = await pool.query(`
    update api_endpoints set name = coalesce($2, name), enabled = coalesce($3, enabled), updated_at = now()
    where id = $1 returning *
  `, [c.req.param("id"), parsed.data.name ?? null, parsed.data.enabled ?? null]);
  if (!result.rowCount) return c.json({ error: "Endpoint not found" }, 404);
  return c.json(serializeEndpoint(result.rows[0]));
});

app.get("/api/audio", async (c) => {
  const userId = c.get("session").user.id;
  const result = await pool.query(`
    select id, title, kind, voice, transcript, transcript_original, transcript_edited_at, generation_config, usage,
      mime_type, file_format, size_bytes, duration_seconds, saved, created_at
    from audio_assets where user_id = $1 and deleted_at is null order by created_at desc limit 100
  `, [userId]);
  return c.json({ items: result.rows.map(serializeAudio) });
});

app.get("/api/audio/:id/url", async (c) => {
  const row = await ownedAudio(c.get("session").user.id, c.req.param("id"));
  if (!row) return c.json({ error: "Audio not found" }, 404);
  const suffix = c.req.query("download") === "1" ? "?download=1" : "";
  return c.json({ url: `${env.appBasePath}/api/audio/${encodeURIComponent(row.id)}/content${suffix}`, expiresIn: null });
});

app.get("/api/audio/:id/content", async (c) => {
  const row = await ownedAudio(c.get("session").user.id, c.req.param("id"));
  if (!row) return c.json({ error: "Audio not found" }, 404);
  const requestedRange = c.req.header("Range");
  if (requestedRange && !/^bytes=\d*-\d*$/.test(requestedRange)) return c.json({ error: "Invalid byte range" }, 416);
  const object = await getAudioObject(row.object_key, requestedRange);
  if (!object.Body) return c.json({ error: "Audio object is unavailable" }, 502);
  const filename = `${safeFilename(row.title)}.${row.file_format}`;
  const disposition = c.req.query("download") === "1" ? "attachment" : "inline";
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": object.ContentType || row.mime_type || "application/octet-stream",
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  if (object.ContentLength != null) headers.set("Content-Length", String(object.ContentLength));
  if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
  if (object.ETag) headers.set("ETag", object.ETag);
  const body = object.Body.transformToWebStream
    ? object.Body.transformToWebStream()
    : Readable.toWeb(object.Body as NodeJS.ReadableStream) as ReadableStream;
  return new Response(body as BodyInit, { status: object.ContentRange ? 206 : 200, headers });
});

const transcriptSchema = z.object({ transcript: z.string().max(200_000) });
app.patch("/api/audio/:id/transcript", bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
  const parsed = transcriptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Transcript is invalid" }, 400);
  const userId = c.get("session").user.id;
  const result = await pool.query(`
    update audio_assets
    set transcript = $3, transcript_edited_at = now()
    where id = $1 and user_id = $2 and kind = 'ASR' and deleted_at is null
    returning transcript, transcript_edited_at
  `, [c.req.param("id"), userId, parsed.data.transcript]);
  if (!result.rowCount) return c.json({ error: "Transcript not found" }, 404);
  return c.json({ transcript: result.rows[0].transcript, editedAt: result.rows[0].transcript_edited_at });
});

app.delete("/api/audio/:id", async (c) => {
  const userId = c.get("session").user.id;
  const row = await ownedAudio(userId, c.req.param("id"));
  if (!row) return c.json({ error: "Audio not found" }, 404);
  await deleteAudioObject(row.object_key);
  await pool.query("update audio_assets set deleted_at = now() where id = $1 and user_id = $2", [row.id, userId]);
  return c.body(null, 204);
});

const builtInVoices = new Set(["mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"]);
const upstreamEncodedAudioLimit = 10_000_000;
const rawReferenceAudioLimit = 7_000_000;
const supportedReferenceMimes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);

const ttsSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  generationMode: z.enum(["preset", "design"]).default("preset"),
  voice: z.string().trim().max(200).optional(),
  voiceDescription: z.string().trim().max(1000).optional(),
  format: z.enum(["wav", "mp3", "pcm16"]).default("wav"),
  directorInstruction: z.string().trim().max(1000).optional(),
  optimizeTextPreview: z.boolean().optional(),
  mode: z.enum(["tts", "timed"]).default("tts"),
  targetDuration: z.number().min(5).max(300).optional(),
}).superRefine((value, context) => {
  if (value.mode === "timed" && !value.targetDuration) context.addIssue({ code: "custom", path: ["targetDuration"], message: "Target duration is required" });
  if (value.mode === "timed" && value.generationMode !== "preset") context.addIssue({ code: "custom", path: ["generationMode"], message: "Timed speech currently requires a built-in voice" });
  if (value.generationMode === "preset" && (!value.voice || !builtInVoices.has(value.voice))) context.addIssue({ code: "custom", path: ["voice"], message: "Select an official built-in voice" });
  if (value.generationMode === "design" && !value.voiceDescription) context.addIssue({ code: "custom", path: ["voiceDescription"], message: "Voice description is required" });
});

app.post("/api/generate/tts", bodyLimit({ maxSize: 100 * 1024 }), async (c) => {
  const parsed = ttsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Generation request is invalid", details: parsed.error.flatten() }, 400);
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "Configure your MiMo API Key first" }, 409);
  const model = parsed.data.generationMode === "design" ? "mimo-v2.5-tts-voicedesign" : "mimo-v2.5-tts";
  const voice = parsed.data.generationMode === "preset" ? parsed.data.voice! : "VOICE DESIGN";
  const style = [parsed.data.voiceDescription, parsed.data.directorInstruction].filter(Boolean).join("；") || undefined;
  const job = await createJob(userId, parsed.data.mode, model, parsed.data.text);
  try {
    const output = parsed.data.mode === "timed"
      ? await generateTimedSpeech({ apiKey: config.apiKey, baseUrl: config.baseUrl, text: parsed.data.text, voice: parsed.data.voice, format: parsed.data.format, style, targetDuration: parsed.data.targetDuration! })
      : await generateSpeech({ apiKey: config.apiKey, baseUrl: config.baseUrl, text: parsed.data.text, voice: parsed.data.voice, format: parsed.data.format, style, model, optimizeTextPreview: parsed.data.optimizeTextPreview });
    const id = randomUUID();
    const title = parsed.data.text.slice(0, 72);
    const objectKey = `saved/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.${output.format}`;
    const digest = createHash("sha256").update(output.audio).digest("hex");
    await putAudioObject(objectKey, output.audio, output.mimeType, { userId, jobId: job.id, sha256: digest });
    const inserted = await pool.query(`
      insert into audio_assets (id, user_id, job_id, object_key, title, kind, voice, mime_type, file_format, size_bytes, duration_seconds, sha256, saved, generation_config, usage)
      values ($1, $2, $3, $4, $5, 'TTS', $6, $7, $8, $9, $10, $11, true, $12::jsonb, $13::jsonb) returning *
    `, [id, userId, job.id, objectKey, title, voice, output.mimeType, output.format, output.audio.byteLength, "measuredDuration" in output ? output.measuredDuration : audioDuration(output.audio, output.format), digest, JSON.stringify({ model, generationMode: parsed.data.generationMode, voice: parsed.data.voice ?? null, voiceDescription: parsed.data.voiceDescription ?? null, directorInstruction: parsed.data.directorInstruction ?? null, optimizeTextPreview: parsed.data.optimizeTextPreview ?? null, targetDuration: parsed.data.targetDuration ?? null }), JSON.stringify(output.usage ?? null)]);
    await completeJob(job.id);
    return c.json({ item: serializeAudio(inserted.rows[0]) }, 201);
  } catch (error) {
    await failJob(job.id, error);
    throw error;
  }
});

app.post("/api/generate/tts/stream", bodyLimit({ maxSize: 100 * 1024 }), async (c) => {
  const parsed = ttsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || parsed.data.mode !== "tts" || parsed.data.generationMode !== "preset") {
    return c.json({ error: "Low-latency streaming requires a built-in voice" }, 400);
  }
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "Configure your MiMo API Key first" }, 409);
  const model = "mimo-v2.5-tts";
  const voice = parsed.data.voice!;
  const job = await createJob(userId, "tts", model, parsed.data.text);
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const controller = new AbortController();
    stream.onAbort(() => controller.abort(new Error("Client disconnected")));
    try {
      await stream.writeSSE({ event: "start", data: JSON.stringify({ model, format: "pcm16", sampleRate: 24000 }) });
      const output = await generateSpeechStream({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        text: parsed.data.text,
        voice,
        style: parsed.data.directorInstruction,
        signal: controller.signal,
      }, async (audio) => {
        await stream.writeSSE({ event: "audio", data: JSON.stringify({ audio }) });
      });
      const id = randomUUID();
      const title = parsed.data.text.slice(0, 72);
      const objectKey = `saved/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.wav`;
      const digest = createHash("sha256").update(output.audio).digest("hex");
      await putAudioObject(objectKey, output.audio, output.mimeType, { userId, jobId: job.id, sha256: digest });
      const inserted = await pool.query(`
        insert into audio_assets (id, user_id, job_id, object_key, title, kind, voice, mime_type, file_format, size_bytes, duration_seconds, sha256, saved, generation_config, usage)
        values ($1, $2, $3, $4, $5, 'TTS', $6, $7, 'wav', $8, $9, $10, true, $11::jsonb, $12::jsonb) returning *
      `, [id, userId, job.id, objectKey, title, voice, output.mimeType, output.audio.byteLength, output.measuredDuration, digest, JSON.stringify({ model, generationMode: "preset", voice, directorInstruction: parsed.data.directorInstruction ?? null, streaming: "low-latency-pcm16" }), JSON.stringify(output.usage ?? null)]);
      await completeJob(job.id);
      await stream.writeSSE({ event: "complete", data: JSON.stringify({ item: serializeAudio(inserted.rows[0]) }) });
    } catch (error) {
      await failJob(job.id, error);
      if (!controller.signal.aborted) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: streamErrorMessage(error) }) }).catch(() => undefined);
      }
    }
  });
});

app.post("/api/generate/tts/clone", bodyLimit({ maxSize: rawReferenceAudioLimit + 1024 * 1024 }), async (c) => {
  const body = await c.req.parseBody();
  const file = body.reference;
  const text = String(body.text || "").trim();
  const format = String(body.format || "wav");
  const directorInstruction = String(body.directorInstruction || "").trim();
  const consent = String(body.consent || "") === "true";
  if (!(file instanceof File)) return c.json({ error: "Reference audio is required" }, 400);
  if (!consent) return c.json({ error: "Confirm that you have permission to clone this voice" }, 400);
  if (!text || text.length > 4096 || !["wav", "mp3", "pcm16"].includes(format)) return c.json({ error: "Generation request is invalid" }, 400);
  const referenceMime = mimeFromReferenceFile(file);
  if (!referenceMime || file.size > rawReferenceAudioLimit) return c.json({ error: "Reference audio must be an MP3 or WAV file no larger than 7 MB" }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoded = Buffer.from(bytes).toString("base64");
  const voiceDataUrl = `data:${referenceMime};base64,${encoded}`;
  if (Buffer.byteLength(voiceDataUrl, "utf8") > upstreamEncodedAudioLimit) return c.json({ error: "Reference audio exceeds MiMo's encoded 10 MB limit" }, 400);
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "Configure your MiMo API Key first" }, 409);
  const model = "mimo-v2.5-tts-voiceclone";
  const job = await createJob(userId, "tts", model, text);
  try {
    const output = await generateSpeech({ apiKey: config.apiKey, baseUrl: config.baseUrl, text, voice: voiceDataUrl, format: format as "wav" | "mp3" | "pcm16", style: directorInstruction || undefined, model });
    const id = randomUUID();
    const title = text.slice(0, 72);
    const objectKey = `saved/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.${output.format}`;
    const digest = createHash("sha256").update(output.audio).digest("hex");
    await putAudioObject(objectKey, output.audio, output.mimeType, { userId, jobId: job.id, sha256: digest });
    const inserted = await pool.query(`
      insert into audio_assets (id, user_id, job_id, object_key, title, kind, voice, mime_type, file_format, size_bytes, duration_seconds, sha256, saved, generation_config, usage)
      values ($1, $2, $3, $4, $5, 'TTS', 'VOICE CLONE', $6, $7, $8, $9, $10, true, $11::jsonb, $12::jsonb) returning *
    `, [id, userId, job.id, objectKey, title, output.mimeType, output.format, output.audio.byteLength, audioDuration(output.audio, output.format), digest, JSON.stringify({ model, referenceName: file.name.slice(0, 120), directorInstruction: directorInstruction || null, consent: true }), JSON.stringify(output.usage ?? null)]);
    await completeJob(job.id);
    return c.json({ item: serializeAudio(inserted.rows[0]) }, 201);
  } catch (error) {
    await failJob(job.id, error);
    throw error;
  }
});

app.post("/api/generate/asr", bodyLimit({ maxSize: rawReferenceAudioLimit + 1024 * 1024 }), async (c) => {
  const body = await c.req.parseBody();
  const file = body.audio;
  if (!(file instanceof File)) return c.json({ error: "Audio file is required" }, 400);
  const sourceMime = mimeFromReferenceFile(file);
  if (!sourceMime || file.size > rawReferenceAudioLimit) return c.json({ error: "Audio must be an MP3 or WAV file no larger than 7 MB" }, 400);
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "Configure your MiMo API Key first" }, 409);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encodedBytes = Buffer.byteLength(`data:${sourceMime};base64,${Buffer.from(bytes).toString("base64")}`, "utf8");
  if (encodedBytes > upstreamEncodedAudioLimit) return c.json({ error: "Audio exceeds MiMo's encoded 10 MB limit" }, 400);
  const job = await createJob(userId, "asr", "mimo-v2.5-asr", file.name);
  try {
    const language = ["auto", "zh", "en"].includes(String(body.language)) ? String(body.language) : "auto";
    const result = await transcribeAudio({ apiKey: config.apiKey, baseUrl: config.baseUrl, audio: bytes, mimeType: sourceMime, language });
    const id = randomUUID();
    const extension = safeExtension(file.name, file.type);
    const objectKey = `saved/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
    const digest = createHash("sha256").update(bytes).digest("hex");
    await putAudioObject(objectKey, bytes, sourceMime, { userId, jobId: job.id, sha256: digest });
    const inserted = await pool.query(`
      insert into audio_assets (id, user_id, job_id, object_key, title, kind, voice, transcript, transcript_original, mime_type, file_format, size_bytes, sha256, saved, generation_config, usage)
      values ($1, $2, $3, $4, $5, 'ASR', $6, $7, $7, $8, $9, $10, $11, true, $12::jsonb, $13::jsonb) returning *
    `, [id, userId, job.id, objectKey, file.name.slice(0, 120), language, result.text, sourceMime, extension, bytes.byteLength, digest, JSON.stringify({ model: "mimo-v2.5-asr", language, sourceName: file.name.slice(0, 120) }), JSON.stringify(result.usage ?? null)]);
    await completeJob(job.id);
    return c.json({ item: serializeAudio(inserted.rows[0]), transcript: result.text, usage: result.usage }, 201);
  } catch (error) {
    await failJob(job.id, error);
    throw error;
  }
});

app.post("/api/generate/asr/stream", bodyLimit({ maxSize: rawReferenceAudioLimit + 1024 * 1024 }), async (c) => {
  const body = await c.req.parseBody();
  const file = body.audio;
  if (!(file instanceof File)) return c.json({ error: "Audio file is required" }, 400);
  const sourceMime = mimeFromReferenceFile(file);
  if (!sourceMime || file.size > rawReferenceAudioLimit) return c.json({ error: "Audio must be an MP3 or WAV file no larger than 7 MB" }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encodedBytes = Buffer.byteLength(`data:${sourceMime};base64,${Buffer.from(bytes).toString("base64")}`, "utf8");
  if (encodedBytes > upstreamEncodedAudioLimit) return c.json({ error: "Audio exceeds MiMo's encoded 10 MB limit" }, 400);
  const userId = c.get("session").user.id;
  const config = await loadMimoConfig(userId);
  if (!config) return c.json({ error: "Configure your MiMo API Key first" }, 409);
  const language = ["auto", "zh", "en"].includes(String(body.language)) ? String(body.language) : "auto";
  const job = await createJob(userId, "asr", "mimo-v2.5-asr", file.name);
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const controller = new AbortController();
    stream.onAbort(() => controller.abort(new Error("Client disconnected")));
    try {
      await stream.writeSSE({ event: "start", data: JSON.stringify({ model: "mimo-v2.5-asr", language }) });
      const result = await transcribeAudioStream({ apiKey: config.apiKey, baseUrl: config.baseUrl, audio: bytes, mimeType: sourceMime, language, signal: controller.signal }, async (delta) => {
        await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: delta }) });
      });
      const id = randomUUID();
      const extension = safeExtension(file.name, sourceMime);
      const objectKey = `saved/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
      const digest = createHash("sha256").update(bytes).digest("hex");
      await putAudioObject(objectKey, bytes, sourceMime, { userId, jobId: job.id, sha256: digest });
      const inserted = await pool.query(`
        insert into audio_assets (id, user_id, job_id, object_key, title, kind, voice, transcript, transcript_original, mime_type, file_format, size_bytes, sha256, saved, generation_config, usage)
        values ($1, $2, $3, $4, $5, 'ASR', $6, $7, $7, $8, $9, $10, $11, true, $12::jsonb, $13::jsonb) returning *
      `, [id, userId, job.id, objectKey, file.name.slice(0, 120), language, result.text, sourceMime, extension, bytes.byteLength, digest, JSON.stringify({ model: "mimo-v2.5-asr", language, sourceName: file.name.slice(0, 120), streaming: true }), JSON.stringify(result.usage ?? null)]);
      await completeJob(job.id);
      await stream.writeSSE({ event: "complete", data: JSON.stringify({ item: serializeAudio(inserted.rows[0]), transcript: result.text, usage: result.usage }) });
    } catch (error) {
      await failJob(job.id, error);
      if (!controller.signal.aborted) {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: streamErrorMessage(error) }) }).catch(() => undefined);
      }
    }
  });
});

app.onError((error, c) => {
  const status = (error as Error & { status?: number }).status;
  console.error("[api]", c.req.method, c.req.path, error.message);
  if (status === 401 || status === 403) return c.json({ error: "MiMo rejected the configured API Key" }, 502);
  return c.json({ error: env.isProduction ? "Request failed" : error.message }, 500);
});

async function loadMimoConfig(userId: string) {
  const result = await pool.query(`
    select c.ciphertext, c.iv, c.auth_tag, c.key_version, c.last_four, c.api_base_url
    from api_credentials c
    join api_endpoints e on e.base_url = c.api_base_url and e.enabled = true
    where c.user_id = $1 and c.provider = 'mimo'
  `, [userId]);
  const row = result.rows[0];
  return row ? { apiKey: decryptCredential(row, userId), baseUrl: row.api_base_url as string, lastFour: row.last_four as string } : null;
}

function normalizeBaseUrl(raw: string) {
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "") || "";
  return url.toString().replace(/\/$/, "");
}

function assertPublicHttpsUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Only clean HTTPS endpoint URLs are allowed");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private network endpoints are not allowed");
  if (isIP(hostname)) {
    const blockedV4 = /^(10\.|127\.|169\.254\.|192\.168\.|0\.)/.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    const blockedV6 = hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:");
    if (blockedV4 || blockedV6) throw new Error("Private network endpoints are not allowed");
  }
}

async function requireEnabledEndpoint(raw: string) {
  const baseUrl = normalizeBaseUrl(raw);
  assertPublicHttpsUrl(baseUrl);
  const result = await pool.query("select 1 from api_endpoints where base_url = $1 and enabled = true", [baseUrl]);
  if (!result.rowCount) {
    const error = new Error("This API Base URL is not approved by an administrator") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
  return baseUrl;
}

function serializeEndpoint(row: any) {
  return { id: row.id, name: row.name, baseUrl: row.base_url, enabled: Boolean(row.enabled ?? true), isSystem: Boolean(row.is_system), createdAt: row.created_at };
}

async function createJob(userId: string, kind: "tts" | "timed" | "asr", model: string, preview: string) {
  const result = await pool.query("insert into generation_jobs (user_id, kind, status, model, input_preview) values ($1, $2, 'processing', $3, $4) returning id", [userId, kind, model, preview.slice(0, 160)]);
  return result.rows[0];
}

const completeJob = (id: string) => pool.query("update generation_jobs set status = 'completed', completed_at = now() where id = $1", [id]);
const failJob = (id: string, error: unknown) => pool.query("update generation_jobs set status = 'failed', error_code = $2, completed_at = now() where id = $1", [id, error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN"]);
const streamErrorMessage = (error: unknown) => {
  const status = (error as Error & { status?: number })?.status;
  if (status === 401 || status === 403) return "MiMo rejected the configured API Key";
  return env.isProduction ? "Streaming request failed" : error instanceof Error ? error.message : "Streaming request failed";
};
const safeFilename = (value: string) => value.replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 72) || "mimo-audio";
const safeExtension = (name: string, mime: string) => name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || (mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : "mp3");
const mimeFromReferenceFile = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["mp3", "wav"].includes(extension)) return null;
  if (file.type && !supportedReferenceMimes.has(file.type)) return null;
  return extension === "wav" ? "audio/wav" : "audio/mpeg";
};

function audioDuration(audio: Uint8Array, format: string) {
  if (format !== "wav" || audio.byteLength < 44) return null;
  const view = Buffer.from(audio);
  const byteRate = view.readUInt32LE(28);
  const dataBytes = view.readUInt32LE(40);
  return byteRate > 0 ? Number((dataBytes / byteRate).toFixed(3)) : null;
}

function serializeAudio(row: any) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    voice: row.voice,
    transcript: row.transcript,
    transcriptOriginal: row.transcript_original,
    transcriptEditedAt: row.transcript_edited_at,
    generationConfig: row.generation_config ?? {},
    usage: row.usage ?? null,
    mimeType: row.mime_type,
    format: row.file_format,
    sizeBytes: Number(row.size_bytes),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    saved: Boolean(row.saved),
    createdAt: row.created_at,
  };
}

async function ownedAudio(userId: string, id: string) {
  const result = await pool.query("select * from audio_assets where id = $1 and user_id = $2 and deleted_at is null", [id, userId]);
  return result.rows[0] ?? null;
}

const apiHostname = env.isProduction ? "0.0.0.0" : "127.0.0.1";
const server = serve({ fetch: app.fetch, port: env.PORT, hostname: apiHostname }, (info) => {
  console.log(`MiMo Studio API listening on http://${apiHostname}:${info.port}`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

export { app };
