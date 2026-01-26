import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import stream from "stream";

const REGION = process.env.S3_REGION || "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT; // eg http://minio:9000
const ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const BUCKET = process.env.S3_BUCKET || "pod";

const client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true
});

export async function ensureBucket() {
  // MinIO auto-create not guaranteed; for demo we skip create and rely on MinIO allowing PutObject to create bucket in console.
  return BUCKET;
}

export async function uploadObject(key: string, buffer: Buffer, contentType = "application/octet-stream") {
  await client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }));
  const url = `${ENDPOINT ? ENDPOINT.replace(/https?:\/\//, "http://") : ""}/${BUCKET}/${key}`;
  return url;
}

export async function getObjectStream(key: string) {
  const out = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return out.Body as stream.Readable;
}
