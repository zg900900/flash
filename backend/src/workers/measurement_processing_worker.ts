import { Worker } from "bullmq";
import IORedis from "ioredis";
import { performMeasurement } from "./measurement_inference_worker"; // previously provided
import pool from "../db";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

const connection = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });

const worker = new Worker("measurement-processing", async (job) => {
  // job.data expected: { jobId: number, payload: { imageKey, vehicle, userRefPoints } }
  console.log("measurement-processing worker got job:", job.id, job.data);
  const jobId = job.data.jobId || job.id;
  const payload = job.data.payload || job.data;
  const imageKey = payload.imageKey;
  const vehicle = payload.vehicle || {};

  if (!imageKey) {
    console.warn("measurement job missing imageKey, marking failed");
    await pool.query("UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3", ["failed", { error: "missing imageKey" }, jobId]);
    return;
  }

  try {
    // mark job processing
    await pool.query("UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2", ["processing", jobId]);

    // call performMeasurement which will call measurement service and update DB + publish updates
    await performMeasurement(jobId, imageKey, vehicle);

    console.log("measurement-processing job finished:", jobId);
  } catch (err) {
    console.error("measurement-processing worker error:", err);
    try {
      await pool.query("UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3", ["failed", { error: String(err) }, jobId]);
    } catch (e) {
      console.error("failed to mark job failed in DB:", e);
    }
    // publish failure via redis (performMeasurement already publishes on error; we ensure it here too)
    const redis = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });
    try {
      await redis.publish("job_updates", JSON.stringify({ jobId, status: "failed", result: { error: String(err) } }));
    } catch (e) {
      console.warn("failed to publish job failure:", e);
    } finally {
      redis.disconnect();
    }
  }
}, { connection });

worker.on("error", (err) => {
  console.error("measurement-processing worker encountered an error:", err);
});

console.log("Measurement-processing worker started, listening for jobs.");