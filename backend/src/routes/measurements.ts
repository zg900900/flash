import express from "express";
import { Queue } from "bullmq";
import pool from "../db";

const router = express.Router();

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT || 6379)
};
const queue = new Queue("measurement-processing", { connection: redisConnection });

// POST /api/measurements
// body: { imageKey: string, vehicle: { L?: number, W?: number, H?: number, unit?: 'mm'|'cm'|'m' }, userRefPoints?: [{x,y,name}] }
router.post("/", express.json(), async (req, res) => {
  try {
    const { imageKey, vehicle, userRefPoints } = req.body;
    if (!imageKey) return res.status(400).json({ error: "missing imageKey" });

    const payload = { imageKey, vehicle: vehicle || {}, userRefPoints: userRefPoints || [] };

    const r = await pool.query(
      `INSERT INTO jobs (type, payload, status) VALUES ($1,$2,$3) RETURNING id`,
      ["measurement", payload, "queued"]
    );
    const jobId = r.rows[0].id;

    // enqueue measurement job
    await queue.add("measure", { jobId, payload });

    res.status(201).json({ jobId });
  } catch (err) {
    console.error("measure POST error", err);
    res.status(500).json({ error: "measurement enqueue failed" });
  }
});

// GET /api/measurements/:id
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "not found" });
    const job = r.rows[0];

    // attach S3-accessible URLs if result contains keys
    let resultWithUrls = job.result;
    try {
      const endpoint = process.env.S3_ENDPOINT ? process.env.S3_ENDPOINT.replace(/\/+$/, "") : "";
      const bucket = process.env.S3_BUCKET || "pod";
      if (job.result && typeof job.result === "object") {
        const resObj: any = { ...job.result };
        if (resObj.parts && Array.isArray(resObj.parts)) {
          resObj.parts = resObj.parts.map((p: any) => {
            if (p.rectifiedKey) {
              p.rectifiedUrl = endpoint ? `${endpoint}/${bucket}/${p.rectifiedKey}` : `${bucket}/${p.rectifiedKey}`;
            }
            if (p.maskKey) {
              p.maskUrl = endpoint ? `${endpoint}/${bucket}/${p.maskKey}` : `${bucket}/${p.maskKey}`;
            }
            return p;
          });
        }
        resultWithUrls = resObj;
      }
    } catch (err) {
      // ignore url enrichment errors
    }

    res.json({ ...job, result: resultWithUrls });
  } catch (err) {
    console.error("measure GET error", err);
    res.status(500).json({ error: "failed" });
  }
});

export default router;