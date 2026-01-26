# POD设计器项目部署说明

本文档说明如何部署从 JSON 对话导出中提取的 POD 设计器项目。

## 项目说明

这是一个面向"拍照→AI处理→在线设计→生产文件导出"的完整应用。包含：
- 前端：React + Vite + Konva
- 后端：Express + TypeScript + Socket.IO
- 处理器：BullMQ worker
- 数据库：PostgreSQL
- 缓存/队列：Redis
- 对象存储：MinIO (S3兼容)
- 可选：Python FastAPI 测量服务（Detectron2/OpenCV）

## 快速部署

### 方式1：使用 Docker Compose（推荐）

#### 基础部署（前端 + 后端 + 处理器 + 数据库）

```bash
# 1. 克隆或进入项目目录
cd /path/to/flash

# 2. 启动所有服务
docker-compose up --build -d

# 3. 查看日志
docker-compose logs -f

# 4. 访问服务
# - 前端: http://localhost:3000
# - 后端 API: http://localhost:4000/api/health
# - MinIO Console: http://localhost:9001 (minioadmin/minioadmin)
# - PgAdmin: http://localhost:5050 (pgadmin4@pgadmin.org/admin)
```

#### 完整部署（包含测量服务）

```bash
# 启动所有服务包括 Python 测量服务
docker-compose -f docker-compose.yml -f docker-compose.override.yml up --build -d

# 查看所有容器状态
docker-compose -f docker-compose.yml -f docker-compose.override.yml ps
```

#### 包含独立 Worker 容器

```bash
# 如果需要独立的测量处理 worker
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.override.yml \
  -f docker-compose.worker.override.yml \
  up --build -d
```

### 方式2：本地开发模式

#### 前端开发

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:5173
```

#### 后端开发

```bash
cd backend
npm install

# 需要先启动 PostgreSQL 和 Redis
docker-compose up -d postgres redis minio

# 启动后端
npm run dev
# 后端运行在 http://localhost:4000
```

#### 处理器开发

```bash
cd processor
npm install
npm run dev
```

## 环境变量配置

### 后端环境变量

```bash
PORT=4000
PGHOST=postgres
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=poddb
REDIS_HOST=redis
REDIS_PORT=6379
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=pod
MEASUREMENT_SERVICE_URL=http://measurement-service:8000  # 如果启用测量服务
```

### 前端环境变量

在 `frontend/.env` 或通过 Vite 配置：

```bash
VITE_API_URL=http://localhost:4000
VITE_S3_ENDPOINT=http://localhost:9000
VITE_S3_BUCKET=pod
```

## 验证部署

### 1. 检查容器状态

```bash
docker-compose ps
```

所有容器应该显示为 "running" 或 "Up"。

### 2. 测试后端 API

```bash
curl http://localhost:4000/api/health
# 应该返回: {"status":"ok"}
```

### 3. 测试前端

在浏览器访问 http://localhost:3000，应该能看到 POD 设计器界面。

### 4. 测试文件上传

```bash
# 上传测试图片
curl -X POST -F "file=@test.jpg" http://localhost:4000/api/uploads
```

### 5. 运行端到端测试（可选）

```bash
chmod +x scripts/e2e_measurement_test.sh
./scripts/e2e_measurement_test.sh test.jpg
```

## 停止服务

```bash
# 停止所有服务
docker-compose down

# 停止并删除数据卷（警告：会删除所有数据）
docker-compose down -v
```

## 故障排查

### 前端无法连接到后端

1. 检查 `VITE_API_URL` 环境变量
2. 检查后端容器是否正常运行：`docker-compose logs backend`
3. 确认端口映射正确

### 后端无法连接数据库

1. 检查 PostgreSQL 容器状态：`docker-compose logs postgres`
2. 验证环境变量配置
3. 确保 PostgreSQL 完全启动（可能需要等待几秒）

### MinIO 连接失败

1. 检查 MinIO 容器：`docker-compose logs minio`
2. 访问 MinIO Console 确认服务正常：http://localhost:9001
3. 确认 bucket 已创建或自动创建

### 处理任务未执行

1. 检查 Redis 容器：`docker-compose logs redis`
2. 检查 processor 容器：`docker-compose logs processor`
3. 确认 BullMQ 连接正常

## 生产部署建议

1. **环境变量**: 使用 `.env` 文件或密钥管理系统
2. **数据库**: 使用持久化卷或外部数据库服务
3. **对象存储**: 考虑使用 AWS S3 或其他云存储
4. **反向代理**: 使用 Nginx 或 Traefik
5. **HTTPS**: 配置 SSL 证书
6. **监控**: 添加日志聚合和监控
7. **扩展**: 使用 Kubernetes 或 Docker Swarm

## CI/CD 部署

项目包含 GitHub Actions 工作流：

- `.github/workflows/release.yml` - 发布构建
- `.github/workflows/build-and-release-assets.yml` - 构建和发布资产
- `.github/workflows/deploy-ssh.yml` - SSH 远程部署

查看对应文件了解详细配置。

## 更多信息

- 详细架构说明：见 `README.md`
- 测量服务文档：见 `measurement_service/README.md`
- E2E 测试文档：见 `README_MEASUREMENT_E2E.md`
- API 文档：见 `openapi.yaml`

## 支持

如有问题，请查看：
- GitHub Issues
- 项目文档
- Docker Compose 日志
