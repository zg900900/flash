import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { Pool } from "pg";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

const PGPOOL = new Pool({
  host: process.env.PGHOST || "localhost",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "poddb"
});

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET = process.env.S3_SECRET_KEY || "minioadmin";
const S3_BUCKET = process.env.S3_BUCKET || "pod";

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: S3_ACCESS, secretAccessKey: S3_SECRET },
  forcePathStyle: true
});

function streamToBufferAsync(body: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    if (!body || typeof body.on !== "function") {
      return reject(new Error("Invalid body stream"));
    }
    body.on("data", (chunk: Buffer) => chunks.push(chunk));
    body.on("end", () => resolve(Buffer.concat(chunks)));
    body.on("error", (err: any) => reject(err));
  });
}

const redisPub = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });

async function publishJobUpdate(jobId: number, status: string, result: any) {
  try {
    await redisPub.publish("job_updates", JSON.stringify({ jobId, status, result }));
  } catch (err) {
    console.warn("publishJobUpdate error:", err);
  }
}

/**
 * Measurement job processor (stub)
 * - downloads image from S3
 * - computes simple bbox of non-white pixels as approximate car area
 * - uses provided vehicle dimensions (W/L/H) to compute meters-per-pixel
 * - crops rectified (here simply the bbox) image and uploads to S3 as processed/measurements/<jobId>.png
 * - writes result to jobs table and publishes job update
 */
async function processMeasurement(job: any) {
  const payload = job.data.payload;
  const key = payload.imageKey;
  try {
    console.log("Measurement job for key:", key, "jobId:", job.data.jobId);
    const get = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const body = get.Body as any;
    const buffer = await streamToBufferAsync(body);

    // get original dimensions
    const imgMeta = await sharp(buffer).metadata();
    const origW = imgMeta.width || 0;
    const origH = imgMeta.height || 0;

    // resize for faster processing
    const maxDim = 1024;
    const resizeFactor = Math.max(1, Math.max(origW, origH) / maxDim);
    const procWidth = Math.round((origW || maxDim) / resizeFactor);
    const procHeight = Math.round((origH || maxDim) / resizeFactor);

    // convert to greyscale raw for thresholding
    const { data: raw, info } = await sharp(buffer)
      .resize(procWidth, procHeight, { fit: 'inside' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;

    // compute mean brightness to choose threshold
    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum += raw[i];
    const mean = sum / raw.length;
    // threshold heuristics: consider pixels darker than mean * 1.1 as foreground candidate
    const thresh = Math.max(30, Math.min(220, mean * 0.95));

    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = raw[y * w + x];
        if (v < thresh) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // fallback if nothing found: use full image
    if (minX > maxX || minY > maxY) {
      minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
    }

    // map bbox coordinates back to original image pixels
    const scaleBackX = (origW || w) / w;
    const scaleBackY = (origH || h) / h;
    const origMinX = Math.max(0, Math.round(minX * scaleBackX));
    const origMinY = Math.max(0, Math.round(minY * scaleBackY));
    const origMaxX = Math.min(origW - 1, Math.round(maxX * scaleBackX));
    const origMaxY = Math.min(origH - 1, Math.round(maxY * scaleBackY));
    const bboxW = origMaxX - origMinX;
    const bboxH = origMaxY - origMinY;

    // choose user-provided real-world width (meters) or fallback default
    let realWidthMeters = 0;
    if (payload.vehicle && payload.vehicle.W) {
      // convert to meters depending on unit
      const unit = (payload.vehicle.unit || "m").toLowerCase();
      const v = Number(payload.vehicle.W);
      if (unit === "mm") realWidthMeters = v / 1000;
      else if (unit === "cm") realWidthMeters = v / 100;
      else realWidthMeters = v;
    } else if (payload.vehicle && payload.vehicle.L) {
      const unit = (payload.vehicle.unit || "m").toLowerCase();
      const v = Number(payload.vehicle.L);
      if (unit === "mm") realWidthMeters = v / 1000;
      else if (unit === "cm") realWidthMeters = v / 100;
      else realWidthMeters = v;
    } else {
      // fallback assumption for a typical car width ~1.8m
      realWidthMeters = 1.8;
    }

    // avoid division by zero
    const metersPerPixel = bboxW > 0 ? (realWidthMeters / bboxW) : 0;

    // crop bbox from original to create rectified image (stub)
    const outBuffer = await sharp(buffer)
      .extract({ left: origMinX, top: origMinY, width: Math.max(1, bboxW), height: Math.max(1, bboxH) })
      .resize(1200, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();

    const rectKey = `processed/measurements/${Date.now()}-${job.data.jobId}.jpg`;
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: rectKey, Body: outBuffer, ContentType: "image/jpeg" }));

    // build parts result (single whole_car part for stub)
    const part = {
      name: "whole_car",
      polygon: [
        { x: origMinX, y: origMinY },
        { x: origMaxX, y: origMinY },
        { x: origMaxX, y: origMaxY },
        { x: origMinX, y: origMaxY }
      ],
      rectifiedKey: rectKey,
      rectifiedPx: { w: Math.max(1, bboxW), h: Math.max(1, bboxH) },
      physicalSize: {
        width_m: bboxW * metersPerPixel,
        height_m: bboxH * metersPerPixel,
        area_m2: Math.max(0, bboxW * bboxH * metersPerPixel * metersPerPixel)
      },
      confidence: 0.6, // stub confidence
      error_estimate_cm: Math.max(1.0, Math.round((1.0 / Math.max(0.0001, metersPerPixel)) * 100) / 100) // dummy
    };

    // update jobs table
    await PGPOOL.query("UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3", ["done", { parts: [part], pose: null, overallConfidence: 0.6 }, job.data.jobId]);

    // publish update
    const endpoint = S3_ENDPOINT ? S3_ENDPOINT.replace(/\/+$/, "") : "";
    const rectUrl = endpoint ? `${endpoint}/${S3_BUCKET}/${rectKey}` : `${S3_BUCKET}/${rectKey}`;
    await publishJobUpdate(job.data.jobId, "done", { parts: [{ ...part, rectifiedUrl: rectUrl, rectifiedKey: rectKey }] });

    console.log("Measurement done for jobId:", job.data.jobId);
  } catch (err) {
    console.error("processMeasurement error:", err);
    try {
      await PGPOOL.query("UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3", ["failed", { error: String(err) }, job.data.jobId]);
      await publishJobUpdate(job.data.jobId, "failed", { error: String(err) });
    } catch (e) {
      console.error("Failed to update job status in DB:", e);
    }
  }
}

/**
 * Existing image-processing worker (kept from previous)
 * For brevity, assume same image-processing handler exists below (or reuse earlier file).
 * Here we instantiate two workers.
 */
const connection = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });

// Worker for general image-processing (existing)
const imageWorker = new Worker("image-processing", async (job) => {
  // existing image processing logic (resize/watermark/segmentation), for brevity you can reuse previous implementation
  // For this stub we keep it minimal: if job.type = 'process' we handle similarly to previous examples
  // If you have existing logic, keep it here.
  console.log("Image worker received job:", job.id);
}, { connection });

// Worker for measurement-processing
const measurementWorker = new Worker("measurement-processing", async (job) => {
  await processMeasurement(job);
}, { connection });

measurementWorker.on("completed", (job) => {
  console.log(`Measurement worker completed job ${job.id}`);
});
measurementWorker.on("failed", (job, err) => {
  console.error(`Measurement worker failed job ${job?.id}:`, err);
});

console.log("Processor workers started: image-processing and measurement-processing");