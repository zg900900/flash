import express from 'express';
import cors from 'cors';
import uploadsRouter from './routes/uploads';
import measurementsRouter from './routes/measurements';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use(uploadsRouter);
app.use(measurementsRouter);

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
