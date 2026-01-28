# Multi-stage worker Dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
CMD ["node", "dist/workers/measurement_processing_worker.js"]
