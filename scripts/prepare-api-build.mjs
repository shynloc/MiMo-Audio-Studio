import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/server-api/migrations", { recursive: true });
await cp("server/migrations/001_application.sql", "dist/server-api/migrations/001_application.sql");
console.log("Prepared API migration assets");

