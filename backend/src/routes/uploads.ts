import express from "express";
import multer from "multer";
import { uploadObject } from "../s3";
import pool from "../db";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no file" });
    const key = `uploads/${Date.now()}-${req.file.originalname}`;
    await uploadObject(key, req.file.buffer, req.file.mimetype);
    // insert upload record as job payload or simply return url
    const url = `${process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/https?:\/\//, "http://") : ""}/${process.env.S3_BUCKET}/${key}`;
    res.json({ url, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "upload failed" });
  }
});

router.post("/process", express.json(), async (req, res) => {
  // create a job record in DB for processor to pick up
  const { key, actions } = req.body;
  if (!key) return res.status(400).json({ error: "missing key" });
  const result = await pool.query(
    `INSERT INTO jobs (type, payload, status) VALUES ($1,$2,$3) RETURNING id`,
    ["process_image", { key, actions: actions || [] }, "queued"]
  );
  res.status(201).json({ jobId: result.rows[0].id });
});

router.get("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  const result = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "not found" });
  res.json(result.rows[0]);
});

export default router;
