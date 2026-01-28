#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.worker.override.yml"
ENV_FILE=".env"

echo "1) Show merged compose config (validation)..."
docker compose ${COMPOSE_FILES} config || { echo "docker compose config failed"; exit 1; }

echo "2) Build images (plain output)..."
docker compose build --no-cache --progress=plain backend measurement-service measurement-worker

echo "3) Start services"
docker compose ${COMPOSE_FILES} up -d

echo "4) Wait for backend healthcheck (http://localhost:4000/api/health)..."
# Wait up to 120s
for i in {1..24}; do
  if curl -sSf http://localhost:4000/api/health >/dev/null 2>&1; then
    echo "Backend healthy."
    break
  fi
  echo "Waiting for backend... ($i/24)"
  sleep 5
done

echo "5) Show service statuses"
docker compose ps

echo "6) Tailing logs (backend last 200 lines)"
docker compose logs --tail=200 backend

echo ""
echo "NOTE: To use custom worker config, add: -f docker-compose.worker.custom.override.yml"
echo "NOTE: To use custom environment, run with: docker compose --env-file .env up"
