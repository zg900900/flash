import express, { Request, Response } from 'express';

const router = express.Router();

// In-memory store for demo purposes
const measurementResults = new Map<string, any>();

export function storeMeasurementResult(jobId: string, result: any) {
  measurementResults.set(jobId, result);
}

router.get('/api/measurements/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const result = measurementResults.get(id);

  if (!result) {
    return res.status(404).json({ error: 'Measurement not found' });
  }

  res.json(result);
});

export default router;
