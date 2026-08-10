import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

let client: S3Client | null = null;

function getClient() {
  if (!env.r2Configured) throw new Error("R2 storage is not configured");
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return client;
}

export async function putAudioObject(key: string, body: Uint8Array, contentType: string, metadata: Record<string, string>) {
  await getClient().send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType, Metadata: metadata }));
}

export async function signedAudioUrl(key: string, disposition: "inline" | "attachment", filename: string) {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: env.R2_SIGNED_URL_TTL_SECONDS });
}

export async function deleteAudioObject(key: string) {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

export async function checkR2() {
  if (!env.r2Configured) return false;
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: ".healthcheck" }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw error;
  }
  return true;
}

