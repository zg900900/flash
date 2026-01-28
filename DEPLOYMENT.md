# Flash POD Deployment Guide

## Overview

Flash POD is a demonstration scaffold for a measurement processing pipeline. It includes:
- Backend API service (Node.js/TypeScript/Express)
- Measurement processing service (Python/FastAPI)
- Background worker for async processing (BullMQ)
- Supporting services (PostgreSQL, Redis, MinIO)

## Prerequisites

- Docker and Docker Compose
- At least 4GB RAM available for Docker
- curl (for health checks)

## Quick Start - Local Development

### 1. Clone the repository

```bash
git clone https://github.com/zg900900/flash.git
cd flash
```

### 2. Create MinIO bucket (first time only)

The S3/MinIO bucket needs to be created before first use. After starting MinIO, create the bucket:

```bash
# Option 1: Using MinIO Console (recommended for first-time users)
# 1. Start only MinIO first:
docker compose up -d minio

# 2. Visit http://localhost:9001
# 3. Login with minioadmin/minioadmin
# 4. Create bucket named "measurements"

# Option 2: Using docker exec
docker compose up -d minio
sleep 5
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker compose exec minio mc mb local/measurements

# Option 3: The start.sh script will handle services, but you need to create bucket manually after first run
```

### 3. Run the start script

```bash
chmod +x start.sh
./start.sh
```

The start script will:
1. Validate the Docker Compose configuration
2. Build all images (backend, measurement-service, measurement-worker)
3. Start all services
4. Wait for backend health check
5. Display service status and logs

### 3. Manual Docker Compose (Alternative)

If you prefer manual control:

```bash
# Build services
docker compose build

# Start services
docker compose up -d

# Check logs
docker compose logs -f backend
docker compose logs -f measurement-service
docker compose logs -f measurement-worker
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

Default credentials for local testing:
- PostgreSQL: `postgres/postgres`
- MinIO: `minioadmin/minioadmin`
- Redis: no authentication

### Using Custom Worker Configuration

To use a custom worker configuration, replace `docker-compose.worker.override.yml` with `docker-compose.worker.custom.override.yml` in the `start.sh` script or compose command:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.worker.custom.override.yml up -d
```

## Testing the Pipeline

### 1. Upload an image

```bash
curl -X POST http://localhost:4000/api/uploads \
  -F "file=@/path/to/your/image.jpg"
```

Response:
```json
{
  "jobId": "1",
  "status": "queued",
  "fileKey": "uploads/..."
}
```

### 2. Check measurement result

```bash
curl http://localhost:4000/api/measurements/{jobId}
```

### 3. Monitor worker logs

```bash
docker compose logs -f measurement-worker
```

## Service Endpoints

- Backend API: http://localhost:4000
  - Health: GET /api/health
  - Upload: POST /api/uploads
  - Measurements: GET /api/measurements/:id
  
- Measurement Service: http://localhost:8001
  - Health: GET /api/health
  - Measure: POST /api/measure
  
- MinIO Console: http://localhost:9001
  - Username: minioadmin
  - Password: minioadmin

## Switching to GPU-based Detectron2

The current measurement service uses a CPU-only stub with OpenCV for basic image processing. To use GPU-accelerated Detectron2 for advanced object detection:

### Requirements

- NVIDIA GPU with CUDA support
- CUDA 11.7+ and cuDNN installed on host
- nvidia-docker2 runtime

### Steps

1. **Create a GPU-enabled Dockerfile** (`measurement_service/Dockerfile.gpu`):

```dockerfile
FROM nvidia/cuda:11.7.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install PyTorch with CUDA support
RUN pip3 install torch==2.0.0+cu117 torchvision==0.15.0+cu117 \
    --index-url https://download.pytorch.org/whl/cu117

# Install Detectron2
RUN pip3 install detectron2 -f \
    https://dl.fbaipublicfiles.com/detectron2/wheels/cu117/torch2.0/index.html

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

2. **Update docker-compose.yml** to use GPU runtime:

```yaml
measurement-service:
  build:
    context: ./measurement_service
    dockerfile: Dockerfile.gpu
  runtime: nvidia
  environment:
    NVIDIA_VISIBLE_DEVICES: all
    # ... other environment variables
```

3. **Update measure.py** to use Detectron2:

```python
from detectron2.engine import DefaultPredictor
from detectron2.config import get_cfg
from detectron2 import model_zoo

# Initialize Detectron2 predictor
cfg = get_cfg()
cfg.merge_from_file(model_zoo.get_config_file(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
))
cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(
    "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
)
cfg.MODEL.DEVICE = "cuda"
predictor = DefaultPredictor(cfg)

def perform_measurement(image_bytes: bytes):
    # Use Detectron2 for inference
    # ... implementation
```

4. **Rebuild and restart**:

```bash
docker compose build measurement-service
docker compose up -d measurement-service
```

### CUDA Version Compatibility

- CUDA 11.7: PyTorch 2.0.0, Detectron2 0.6
- CUDA 11.8: PyTorch 2.1.0, Detectron2 0.6
- CUDA 12.1: PyTorch 2.1.2, Detectron2 (build from source)

Check your CUDA version:
```bash
nvidia-smi
```

## Troubleshooting

### Services not starting

```bash
# Check service status
docker compose ps

# Check logs for errors
docker compose logs backend
docker compose logs measurement-service
```

### Backend health check fails

```bash
# Check if backend is listening
docker compose exec backend netstat -tuln | grep 4000

# Check backend logs
docker compose logs --tail=100 backend
```

### Worker not processing jobs

```bash
# Check Redis connection
docker compose exec redis redis-cli ping

# Check worker logs
docker compose logs --tail=100 measurement-worker
```

### MinIO connection issues

```bash
# Check MinIO is running
docker compose ps minio

# Create bucket if missing
docker compose exec minio mc mb local/measurements
```

## Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## Production Considerations

For production deployment:

1. **Use strong passwords**: Replace default credentials in `.env`
2. **Enable TLS**: Configure HTTPS for all services
3. **Use managed services**: Consider AWS RDS, ElastiCache, S3 instead of self-hosted
4. **Resource limits**: Set memory and CPU limits in docker-compose.yml
5. **Monitoring**: Add Prometheus/Grafana for metrics
6. **Logging**: Configure centralized logging (ELK, CloudWatch)
7. **Backups**: Regular database and S3 backups
8. **Secrets management**: Use Docker secrets or HashiCorp Vault

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────────────┐
│   Client    │────▶│   Backend    │────▶│  Measurement       │
│             │     │   (Express)  │     │  Service (FastAPI) │
└─────────────┘     └──────────────┘     └────────────────────┘
                           │                       │
                           │                       │
                    ┌──────▼────────┐     ┌───────▼────────┐
                    │  Redis        │     │  MinIO/S3      │
                    │  (BullMQ)     │     │                │
                    └───────┬───────┘     └────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Measurement   │
                    │  Worker        │
                    └────────────────┘
```

## License

MIT
