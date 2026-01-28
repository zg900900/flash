import { Router } from 'express';
import { Queue } from 'bullmq';

const router = Router();

// In-memory store for demo (in production, use database)
const measurementResults = new Map<string, any>();

const measurementQueue = new Queue('measurements', {
  connection: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to get job from queue
    const job = await measurementQueue.getJob(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Measurement not found' });
    }

    const state = await job.getState();
    
    // Check if we have results stored
    const result = measurementResults.get(id);
    
    res.json({
      id: id,
      status: state === 'completed' ? 'done' : state,
      data: job.data,
      result: result || null,
      progress: job.progress,
    });
  } catch (error) {
    console.error('Get measurement error:', error);
    res.status(500).json({ error: 'Failed to get measurement' });
  }
});

// Internal endpoint to store results (called by worker)
router.post('/:id/result', async (req, res) => {
  try {
    const { id } = req.params;
    measurementResults.set(id, req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Store result error:', error);
    res.status(500).json({ error: 'Failed to store result' });
  }
});

export default router;
