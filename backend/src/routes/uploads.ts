import { Router } from 'express';
import multer from 'multer';
import { Queue } from 'bullmq';
import { uploadToS3 } from '../s3';
import crypto from 'crypto';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize BullMQ queue
const measurementQueue = new Queue('measurements', {
  connection: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = crypto.randomUUID();
    const key = `uploads/${fileId}-${req.file.originalname}`;
    const bucketName = process.env.S3_BUCKET || 'pod-designer';

    // Upload to S3 (MinIO)
    await uploadToS3(bucketName, key, req.file.buffer, req.file.mimetype);

    // Enqueue measurement job
    const job = await measurementQueue.add('process-measurement', {
      fileKey: key,
      bucketName: bucketName,
      fileId: fileId,
      originalName: req.file.originalname,
    });

    res.json({
      jobId: job.id,
      fileId: fileId,
      status: 'queued',
      key: key,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
