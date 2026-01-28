# POD Designer - Flash

A production-ready POD (Proof of Delivery) Designer demo application with automated local deployment, measurement service, and CI workflows.

## Features

- **Backend Service**: Express + TypeScript with Socket.IO support
- **Measurement Service**: FastAPI-based image processing with CPU-friendly OpenCV stubs
- **Worker Queue**: BullMQ-based job processing for measurement tasks
- **Object Storage**: MinIO (S3-compatible) for image and mask storage
- **Database**: PostgreSQL for persistent data
- **Cache**: Redis for queue management

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 4GB RAM available for containers
- Ports 4000, 5432, 6379, 8000, 9000, 9001 available

### Run Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/zg900900/flash.git
   cd flash
   ```

2. **Make the start script executable**:
   ```bash
   chmod +x start.sh
   ```

3. **Run the application**:
   ```bash
   ./start.sh
   ```

   This script will:
   - Validate docker-compose configuration
   - Build images (backend, measurement-service, measurement-worker)
   - Start all services
   - Wait for backend health check
   - Display service status and logs

### Manual Docker Compose Commands

If you prefer manual control:

```bash
# Build images
docker compose build backend measurement-service measurement-worker

# Start services
docker compose up -d

# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Using Custom Configuration

To use custom worker configuration:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.worker.override.yml -f docker-compose.worker.custom.override.yml up -d
```

To use a custom environment file:

```bash
docker compose --env-file .env.custom up -d
```

## Environment Variables

The `.env` file contains all configuration. Key variables:

- `PORT`: Backend server port (default: 4000)
- `POSTGRES_*`: Database configuration
- `REDIS_HOST/PORT`: Redis configuration
- `S3_ENDPOINT`: MinIO/S3 endpoint (default: http://minio:9000)
- `MEASUREMENT_SERVICE_URL`: Measurement service endpoint

See `.env` file for complete list.

## API Endpoints

### Backend

- `GET /api/health` - Health check endpoint
- `POST /api/uploads` - Upload image for measurement (multipart/form-data)
- `GET /api/measurements/:id` - Get measurement job status and results

### Measurement Service

- `GET /health` - Health check endpoint
- `POST /infer` - Process image and return measurements
- `POST /measure` - Alias for /infer

## Testing the Application

1. **Check backend health**:
   ```bash
   curl http://localhost:4000/api/health
   ```

2. **Upload a test image**:
   ```bash
   curl -X POST http://localhost:4000/api/uploads \
     -F "file=@/path/to/image.jpg"
   ```
   
   This will return a job ID.

3. **Check measurement status**:
   ```bash
   curl http://localhost:4000/api/measurements/{job-id}
   ```

4. **Access MinIO Console**:
   - URL: http://localhost:9001
   - Username: minioadmin
   - Password: minioadmin

## GPU Support with Detectron2

The measurement service currently uses CPU-friendly OpenCV for demo purposes. To enable GPU acceleration with Detectron2:

### Option 1: Replace Dockerfile

Update `measurement_service/Dockerfile`:

```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 python3-pip \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch with CUDA support
RUN pip3 install torch==2.1.0+cu118 torchvision==0.16.0+cu118 --extra-index-url https://download.pytorch.org/whl/cu118

# Install Detectron2
RUN pip3 install 'git+https://github.com/facebookresearch/detectron2.git'

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Option 2: Use Pre-built Image

Replace the measurement-service in `docker-compose.yml`:

```yaml
measurement-service:
  image: your-registry/flash-measurement-service-gpu:latest
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=all
```

### Recommended GPU Setup

- **CUDA**: 11.8 or 12.1
- **PyTorch**: 2.1.0+ with matching CUDA version
- **Detectron2**: Latest from main branch
- **GPU Memory**: At least 6GB VRAM recommended

Update `measurement_service/app/measure.py` to use Detectron2 predictor instead of OpenCV stubs.

## CI/CD Workflows

### Release Workflow

Automatically builds and pushes images to GitHub Container Registry (GHCR) when:
- Pushed to main branch
- Tag is created (e.g., v1.0.0)
- Manually triggered via workflow_dispatch

Images are pushed as:
- `ghcr.io/{owner}/flash-backend`
- `ghcr.io/{owner}/flash-measurement-service`
- `ghcr.io/{owner}/flash-measurement-worker`

### Build and Release Assets Workflow

Manually triggered workflow that:
- Builds all Docker images
- Saves images as tar.gz files
- Creates a GitHub release with image assets

To use:
1. Go to Actions → Build and Release Docker Images as Assets
2. Click "Run workflow"
3. Enter version (e.g., v1.0.0)
4. Download image archives from the release

## Deployment Notes

### Local Development

The `docker-compose.override.yml` enables:
- Volume mounts for hot-reload
- Debug logging
- Development environment variables

### Production Deployment

For production:
1. Create `docker-compose.prod.yml` with production overrides
2. Use proper secrets management (not hardcoded credentials)
3. Configure proper CORS origins
4. Enable HTTPS/TLS
5. Set up monitoring and logging
6. Use production-grade database backups
7. Configure resource limits and scaling

### Security Considerations

- Change default MinIO credentials in production
- Use secrets for database passwords
- Enable authentication on Redis
- Use TLS for all external communications
- Implement proper CORS policies
- Add rate limiting on API endpoints

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Client    │────▶│   Backend   │────▶│  Measurement     │
│             │◀────│  (Express)  │◀────│   Service        │
└─────────────┘     └─────────────┘     │  (FastAPI)       │
                           │             └──────────────────┘
                           │                      │
                           ▼                      ▼
                    ┌─────────────┐       ┌─────────────┐
                    │    Redis    │       │   MinIO/S3  │
                    │   (Queue)   │       │  (Storage)  │
                    └─────────────┘       └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Worker     │
                    │  (BullMQ)   │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  PostgreSQL │
                    │    (DB)     │
                    └─────────────┘
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs

# Restart services
docker compose restart

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

### Backend health check fails

```bash
# Check backend logs
docker compose logs backend

# Check if port is already in use
netstat -an | grep 4000

# Try rebuilding backend
docker compose build backend
docker compose up -d backend
```

### Worker not processing jobs

```bash
# Check worker logs
docker compose logs measurement-worker

# Check Redis connection
docker compose exec redis redis-cli ping

# Restart worker
docker compose restart measurement-worker
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `./start.sh`
5. Submit a pull request

## License

[Your License Here]

## Support

For issues and questions, please open an issue on GitHub.