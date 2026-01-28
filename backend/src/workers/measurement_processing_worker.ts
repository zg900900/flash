import { Worker, Job } from 'bullmq';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MEASUREMENT_SERVICE_URL = process.env.MEASUREMENT_SERVICE_URL || 'http://measurement-service:8000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4000';

const worker = new Worker(
  'measurements',
  async (job: Job) => {
    console.log(`Processing job ${job.id}:`, job.data);
    
    try {
      const { fileKey, bucketName, fileId } = job.data;
      
      // Call measurement service
      const response = await axios.post(`${MEASUREMENT_SERVICE_URL}/infer`, {
        image_key: fileKey,
        bucket: bucketName,
      });
      
      console.log(`Measurement result for job ${job.id}:`, response.data);
      
      // Store result in backend
      await axios.post(`${BACKEND_URL}/api/measurements/${job.id}/result`, response.data);
      
      // Update job progress
      await job.updateProgress(100);
      
      return response.data;
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      throw error;
    }
  },
  {
    connection: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('Measurement processing worker started');
