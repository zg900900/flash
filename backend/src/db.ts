import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "poddb"
});

export async function initDb() {
  // Create templates table with mask_key
  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id BIGSERIAL PRIMARY KEY,
      name TEXT,
      design JSONB,
      assets JSONB,
      mask_key TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id BIGSERIAL PRIMARY KEY,
      type TEXT,
      payload JSONB,
      status TEXT,
      result JSONB,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // uploads table (optional)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id BIGSERIAL PRIMARY KEY,
      key TEXT,
      url TEXT,
      status TEXT,
      meta JSONB,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
}

export default pool;