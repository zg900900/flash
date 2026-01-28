# Flash POD Demo

A demonstration scaffold for a measurement processing pipeline with backend API, measurement service, and async worker processing.

## Quick Start

```bash
chmod +x start.sh
./start.sh
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup instructions, configuration options, and GPU/Detectron2 integration guide.

## Features

- Backend API (Node.js/TypeScript/Express)
- Measurement Service (Python/FastAPI with OpenCV)
- Async Worker Processing (BullMQ)
- S3/MinIO Storage
- Docker Compose orchestration
- CI/CD with GitHub Actions

## Services

- **Backend**: http://localhost:4000
- **Measurement Service**: http://localhost:8001
- **MinIO Console**: http://localhost:9001

## Testing

Upload an image:
```bash
curl -X POST http://localhost:4000/api/uploads -F "file=@image.jpg"
```

For more information, see [DEPLOYMENT.md](DEPLOYMENT.md).