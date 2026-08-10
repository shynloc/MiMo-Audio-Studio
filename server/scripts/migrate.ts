import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../auth.js";
import { pool } from "../db.js";
import { env } from "../env.js";

async function migrate() {
  const authMigrations = await getMigrations(auth.options);
  await authMigrations.runMigrations();
  const sqlUrl = new URL("../migrations/001_application.sql", import.meta.url);
  const sql = await readFile(fileURLToPath(sqlUrl), "utf8");
  await pool.query(sql);
  if (env.adminEmails.length) {
    const result = await pool.query(
      `update "user" set role = 'admin', "updatedAt" = now() where lower(email) = any($1::text[]) returning email`,
      [env.adminEmails],
    );
    console.log(`Administrator roles synchronized: ${result.rowCount}`);
  }
  console.log("Database migrations completed");
}

migrate()
  .catch((error) => { console.error("Database migration failed:", error.message); process.exitCode = 1; })
  .finally(() => pool.end());
