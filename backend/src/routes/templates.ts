import express from "express";
import pool from "../db";

const router = express.Router();

router.get("/", async (_req, res) => {
  const r = await pool.query("SELECT id, name, design, assets, mask_key, created_at FROM templates ORDER BY created_at DESC");
  res.json(r.rows);
});

router.post("/", express.json(), async (req, res) => {
  const { name, design, assets, maskKey } = req.body;
  // store maskKey in mask_key column
  const r = await pool.query(
    "INSERT INTO templates (name, design, assets, mask_key) VALUES ($1,$2,$3,$4) RETURNING id, created_at",
    [name, design || {}, assets || [], maskKey || null]
  );
  res.status(201).json({ id: r.rows[0].id, created_at: r.rows[0].created_at });
});

export default router;