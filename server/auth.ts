import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { pool } from "./db.js";
import { env } from "./env.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.js";

export const auth = betterAuth({
  appName: "MiMo Studio",
  // Better Auth treats a pathname already present in baseURL as the complete
  // auth mount point. In production the API lives below /audioplayer, so keep
  // baseURL at the site origin and describe the full mount path explicitly.
  baseURL: env.isProduction ? env.APP_ORIGIN : env.API_ORIGIN,
  basePath: env.isProduction ? "/audioplayer/api/auth" : "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  database: pool,
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            role: env.adminEmails.includes(user.email.toLowerCase()) ? "admin" : "user",
          },
        }),
      },
    },
  },
  trustedOrigins: env.trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: env.requireEmailVerification,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendPasswordResetEmail,
  },
  emailVerification: {
    sendOnSignUp: env.requireEmailVerification,
    sendOnSignIn: env.requireEmailVerification,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: env.isProduction,
    cookiePrefix: "mimo_studio",
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "cf-connecting-ip"],
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      path: "/",
    },
  },
});
