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
# data volume mount point
VOLUME ["/app/data"]
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/index.js"]
