import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.databaseSsl ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: "mimo-audio-api",
});

pool.on("error", (error) => {
  console.error("[database] idle client error", error.message);
});

export async function checkDatabase() {
  const result = await pool.query<{ now: Date }>("select now() as now");
  return result.rows[0]?.now;
}

