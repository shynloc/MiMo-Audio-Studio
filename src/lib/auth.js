import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? "http://127.0.0.1:8787" : window.location.origin,
  basePath: `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/auth`,
  fetchOptions: { credentials: "include" },
});
