#!/usr/bin/env bash
# Helper script to run on the remote server (manual deploy option)
# Use: chmod +x scripts/remote-deploy.sh && ./scripts/remote-deploy.sh /path/to/repo
set -e
REPO_PATH="${1:-/home/$(whoami)/pod-designer}"
echo "Using repo path: $REPO_PATH"
mkdir -p "$REPO_PATH"
if [ -d "$REPO_PATH/.git" ]; then
  echo "Updating repo..."
  git -C "$REPO_PATH" fetch --all
  git -C "$REPO_PATH" reset --hard origin/main
else
  echo "Cloning into $REPO_PATH..."
  git clone --depth=1 https://github.com/$(git config --get remote.origin.url | sed -E 's#.*github.com[:/](.*)$#\1#') "$REPO_PATH" || echo "Please clone manually if automatic clone fails."
fi
cd "$REPO_PATH"
# ensure .env exists or set environment variables as needed
# make sure docker and docker compose are installed
docker compose pull || true
docker compose up -d --remove-orphans
docker compose ps
docker compose logs --tail=50