import express, { Request, Response } from 'express';
import multer from 'multer';
import { Queue } from 'bullmq';
import { uploadToS3 } from '../s3';
import { randomUUID } from 'crypto';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const measurementQueue = new Queue('measurements', {
  connection: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

router.post('/api/uploads', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = randomUUID();
    const key = `uploads/${fileId}-${req.file.originalname}`;

    // Upload to S3
    await uploadToS3(key, req.file.buffer, req.file.mimetype);

    // Enqueue job for processing
    const job = await measurementQueue.add('process-measurement', {
      fileKey: key,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    res.json({
      jobId: job.id,
      status: 'queued',
      fileKey: key,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
