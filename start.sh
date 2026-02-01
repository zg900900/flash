#!/usr/bin/env bash
set -euo pipefail

# ANSI color codes
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

COMPOSE_FILES='-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.worker.override.yml'
ENV_FILE='.env'

echo -e "${BLUE}1) Cleaning up previous environment...${NC}"
docker compose ${COMPOSE_FILES} down --remove-orphans

echo -e "${BLUE}2) Show merged compose config (validation)...${NC}"
docker compose ${COMPOSE_FILES} config || { echo "docker compose config failed"; exit 1; }

echo -e "${BLUE}3) Build images (pulling latest bases)...${NC}"
docker compose build --pull --progress=plain backend measurement-service measurement-worker

echo -e "${BLUE}4) Start services${NC}"
docker compose ${COMPOSE_FILES} up -d

echo -e "${BLUE}5) Wait for backend healthcheck (http://localhost:4000/api/health)...${NC}"
# Wait up to 120s
for i in {1..24}; do
  if curl -sSf http://localhost:4000/api/health >/dev/null 2>&1; then
    echo -e "${GREEN}Backend healthy.${NC}"
    break
  fi
  echo "Waiting for backend... ($i/24)"
  sleep 5
done

echo -e "${BLUE}6) Show service statuses${NC}"
docker compose ps

echo -e "${BLUE}7) Auto-create MinIO bucket (if not exists)${NC}"
docker compose exec -T minio mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1 || true
docker compose exec -T minio mc mb local/measurements >/dev/null 2>&1 || true

echo -e "${BLUE}8) Tailing logs (backend last 200 lines)${NC}"
docker compose logs --tail=200 backend
