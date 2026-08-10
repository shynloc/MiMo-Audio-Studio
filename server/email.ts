import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.js";

type EmailMessage = { to: string; subject: string; html: string };
let smtpTransport: Transporter | null = null;

function getSmtpTransport() {
  if (!env.smtpConfigured) return null;
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.smtpSecure,
      requireTLS: !env.smtpSecure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }
  return smtpTransport;
}

async function sendEmail(message: EmailMessage) {
  if (!env.EMAIL_FROM) {
    if (env.isProduction) throw new Error("Transactional email is not configured");
    return;
  }

  const transport = getSmtpTransport();
  if (transport) {
    await transport.sendMail({ from: env.EMAIL_FROM, ...message });
    return;
  }

  if (!env.RESEND_API_KEY) {
    if (env.isProduction) throw new Error("Transactional email is not configured");
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
  });
  if (!response.ok) throw new Error(`Email provider rejected request (${response.status})`);
}

export async function verifyEmailTransport() {
  const transport = getSmtpTransport();
  if (transport) return transport.verify();
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return true;
  throw new Error("Transactional email is not configured");
}

export function sendEmailConfigurationTest(to: string) {
  return sendEmail({
    to,
    subject: "MiMo Studio 邮件服务测试",
    html: "<p>MiMo Studio 的邮箱验证与密码重置邮件服务已成功连接。</p>",
  });
}

const safeLink = (url: string) => url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sendVerificationEmail({ user, url }: { user: { email: string; name: string }; url: string }) {
  return sendEmail({
    to: user.email,
    subject: "验证你的 MiMo Studio 邮箱",
    html: `<p>${user.name || "你好"}，请在一小时内完成邮箱验证。</p><p><a href="${safeLink(url)}">验证邮箱</a></p>`,
  });
}

export function sendPasswordResetEmail({ user, url }: { user: { email: string; name: string }; url: string }) {
  return sendEmail({
    to: user.email,
    subject: "重置你的 MiMo Studio 密码",
    html: `<p>${user.name || "你好"}，请在一小时内重置密码。</p><p><a href="${safeLink(url)}">重置密码</a></p>`,
  });
}
