import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const isProduction = process.env.NODE_ENV === "production";
const developmentSecret = (label: string) => createHash("sha256").update(`mimo-audio-local:${label}`).digest("base64");
const normalizeBasePath = (value: string) => {
  const path = value.trim();
  if (!path || path === "/") return "";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
};

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:4173"),
  API_ORIGIN: z.string().url().default("http://127.0.0.1:8787"),
  APP_BASE_PATH: z.string().default(isProduction ? "/audioplayer" : ""),
  DATABASE_URL: z.string().min(1).default("postgresql://mimo:mimo_local_only@127.0.0.1:55432/mimo_audio"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  BETTER_AUTH_SECRET: z.string().min(32).default(isProduction ? "" : developmentSecret("auth")),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).default(isProduction ? "" : developmentSecret("vault")),
  REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("false"),
  ADMIN_EMAILS: z.string().default(""),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.enum(["true", "false"]).default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("mimo-studio-audio"),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  MIMO_API_BASE_URL: z.string().url().default("https://api.xiaomimimo.com/v1"),
  MIMO_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  MIMO_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(10000).max(600000).default(180000),
  MAX_AUDIO_BYTES: z.coerce.number().int().min(1048576).max(209715200).default(52428800),
}).superRefine((value, context) => {
  if (isProduction && !value.BETTER_AUTH_SECRET) context.addIssue({ code: "custom", path: ["BETTER_AUTH_SECRET"], message: "required in production" });
  if (isProduction && !value.CREDENTIAL_ENCRYPTION_KEY) context.addIssue({ code: "custom", path: ["CREDENTIAL_ENCRYPTION_KEY"], message: "required in production" });
  const smtpConfigured = Boolean(value.SMTP_HOST && value.SMTP_USER && value.SMTP_PASSWORD);
  const resendConfigured = Boolean(value.RESEND_API_KEY);
  if (value.REQUIRE_EMAIL_VERIFICATION === "true" && (!value.EMAIL_FROM || (!smtpConfigured && !resendConfigured))) {
    context.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "EMAIL_FROM and either SMTP or Resend credentials are required when email verification is enabled" });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  throw new Error(`Invalid server environment: ${message}`);
}

const encryptionKey = Buffer.from(parsed.data.CREDENTIAL_ENCRYPTION_KEY, "base64");
if (encryptionKey.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");

export const env = {
  ...parsed.data,
  isProduction,
  databaseSsl: parsed.data.DATABASE_SSL === "true",
  requireEmailVerification: parsed.data.REQUIRE_EMAIL_VERIFICATION === "true",
  smtpSecure: parsed.data.SMTP_SECURE === "true",
  smtpConfigured: Boolean(parsed.data.SMTP_HOST && parsed.data.SMTP_USER && parsed.data.SMTP_PASSWORD),
  adminEmails: parsed.data.ADMIN_EMAILS.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
  encryptionKey,
  trustedOrigins: [parsed.data.APP_ORIGIN, parsed.data.API_ORIGIN],
  r2Configured: Boolean(parsed.data.R2_ACCOUNT_ID && parsed.data.R2_ACCESS_KEY_ID && parsed.data.R2_SECRET_ACCESS_KEY),
  appBasePath: normalizeBasePath(parsed.data.APP_BASE_PATH),
};
