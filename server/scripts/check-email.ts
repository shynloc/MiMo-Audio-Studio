import { env } from "../env.js";
import { sendEmailConfigurationTest, verifyEmailTransport } from "../email.js";

await verifyEmailTransport();
if (process.argv.includes("--send")) {
  if (!env.SMTP_USER) throw new Error("SMTP_USER is required for the test recipient");
  await sendEmailConfigurationTest(env.SMTP_USER);
}

console.log(JSON.stringify({ ok: true, provider: env.smtpConfigured ? "smtp" : "resend", testMessageSent: process.argv.includes("--send") }));
