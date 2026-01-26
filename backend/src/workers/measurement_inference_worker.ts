import fetch from "node-fetch";
import FormData from "form-data";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import pool from "../db";

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION || "us-east-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const S3_BUCKET = process.env.S3_BUCKET || "pod";
const MEASUREMENT_SERVICE_URL = process.env.MEASUREMENT_SERVICE_URL || "http://localhost:8000";

const s3Client = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: true
});

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Perform measurement by calling the Python measurement service
 * @param jobId - The job ID in the database
 * @param imageKey - The S3 key of the uploaded image
 * @param vehicle - Vehicle metadata (width, height, unit)
 */
export async function performMeasurement(
  jobId: number,
  imageKey: string,
  vehicle: { W?: number; H?: number; L?: number; unit?: string } = {}
): Promise<void> {
  const redis = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });

  try {
    // Download image from S3
    const getObjectResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: imageKey
      })
    );

    if (!getObjectResponse.Body) {
      throw new Error("Failed to get image from S3");
    }

    const imageBuffer = await streamToBuffer(getObjectResponse.Body);

    // Prepare form data for measurement service
    const formData = new FormData();
    formData.append("file", imageBuffer, { filename: "image.jpg" });
    
    // Add vehicle dimensions if provided
    if (vehicle.W) {
      formData.append("W", vehicle.W.toString());
    }
    if (vehicle.unit) {
      formData.append("unit", vehicle.unit);
    }

    // Call measurement service
    const response = await fetch(`${MEASUREMENT_SERVICE_URL}/infer`, {
      method: "POST",
      body: formData,
      headers: formData.getHeaders()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Measurement service error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Update job in database with results
    await pool.query(
      `UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3`,
      ["done", result, jobId]
    );

    // Publish success update via Redis
    await redis.publish(
      "job_updates",
      JSON.stringify({
        jobId,
        status: "done",
        result
      })
    );

    console.log(`Measurement completed for job ${jobId}`);
  } catch (error) {
    console.error(`Measurement failed for job ${jobId}:`, error);

    // Update job as failed
    await pool.query(
      `UPDATE jobs SET status=$1, result=$2, updated_at=now() WHERE id=$3`,
      ["failed", { error: String(error) }, jobId]
    );

    // Publish failure update via Redis
    await redis.publish(
      "job_updates",
      JSON.stringify({
        jobId,
        status: "failed",
        result: { error: String(error) }
      })
    );

    throw error;
  } finally {
    redis.disconnect();
  }
}
