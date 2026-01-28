import express, { Request, Response } from 'express';
import multer from 'multer';
import { Queue } from 'bullmq';
import { uploadToS3 } from '../s3';
import { randomUUID } from 'crypto';

const router = express.Router();

// Configure multer with file size limit and file type filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  },
});

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
  } catch (error: any) {
    console.error('Upload error:', error);
    
    // Provide more specific error messages
    if (error.message?.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    } else if (error.message?.includes('File too large')) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    } else if (error.code === 'NoSuchBucket') {
      return res.status(500).json({ error: 'S3 bucket not found. Please contact administrator.' });
    }
    
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Error handling middleware for multer errors
router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }
  }
  next(error);
});

export default router;
