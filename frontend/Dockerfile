# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts ./
RUN npm install
COPY . .
RUN npm run build

# Production nginx stage with custom config
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]