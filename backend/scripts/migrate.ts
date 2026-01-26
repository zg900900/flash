import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST || "localhost",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "poddb"
  });

  try {
    console.log("Running migrations...");
    await pool.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS mask_key TEXT;`);
    console.log("Migration done.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();