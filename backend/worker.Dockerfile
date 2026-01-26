# Minimal Node image to run compiled worker
FROM node:18-alpine

WORKDIR /app

# Copy compiled js and node_modules from a build stage or mount via volume
# Recommended approach: multi-stage build. For brevity, we assume dist is available.
COPY ./dist /app/dist
COPY package.json package-lock.json* yarn.lock* /app/

RUN npm install --only=production

ENV NODE_ENV=production
CMD ["node", "dist/workers/measurement_processing_worker.js"]