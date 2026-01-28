import { Worker } from 'bullmq';
import axios from 'axios';
import { storeMeasurementResult } from '../routes/measurements';

const MEASUREMENT_SERVICE_URL = process.env.MEASUREMENT_SERVICE_URL || 'http://measurement-service:8001';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const worker = new Worker(
  'measurements',
  async (job) => {
    console.log(`Processing job ${job.id}: ${JSON.stringify(job.data)}`);

    try {
      const { fileKey } = job.data;

      // Call measurement service with file key
      const response = await axios.post(
        `${MEASUREMENT_SERVICE_URL}/api/measure`,
        { file_key: fileKey },
        { 
          timeout: 60000, // 60 second timeout
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const result = {
        jobId: job.id,
        status: 'completed',
        measurement: response.data,
        timestamp: new Date().toISOString(),
      };

      // Store result in memory
      storeMeasurementResult(job.id as string, result);

      console.log(`Job ${job.id} completed:`, result);
      return result;
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      throw error;
    }
  },
  {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with error:`, err);
});

console.log('Measurement processing worker started');
