import { Worker } from 'bullmq';
import axios from 'axios';
import { storeMeasurementResult } from '../routes/measurements';

const MEASUREMENT_SERVICE_URL = process.env.MEASUREMENT_SERVICE_URL || 'http://measurement-service:8001';
const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const worker = new Worker(
  'measurements',
  async (job) => {
    console.log(`[Worker] Processing job ${job.id}: ${JSON.stringify(job.data)}`);

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
        status: 'done', // Fixed: Frontend expects 'done' status
        fileKey: fileKey,
        measurement: response.data,
        timestamp: new Date().toISOString(),
      };

      // Store result in memory
      storeMeasurementResult(job.id as string, result);

      console.log(`[Worker] Job ${job.id} marked as done:`, result);
      return result;
    } catch (error) {
      console.error(`[Worker] Job ${job.id} failed:`, error);
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
  console.log(`[Worker] Job ${job.id} has completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} has failed with error:`, err);
});

console.log('Measurement processing worker started and listening on "measurements" queue');
