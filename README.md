# POD Designer — Demo（拍照定制车体车贴的在线应用）仓库说明

本项目是一个面向“拍照→AI处理→在线设计→生产文件导出”的演示骨架。包含前端（React + Vite + Konva）、后端（Express + TypeScript）、处理器（BullMQ worker）、数据库与对象存储组件（Postgres、Redis、MinIO），以及可选的“测量/分割”Python服务（FastAPI + Detectron2/OpenCV）。

你可以用它快速搭建一个行业级 AI 在线应用的最小可行产品（MVP），用于拍照定制车体贴膜/车贴的工作流。

---

## 功能概览

- 前端
  - 拍照引导组件（摄像头预览、质量检测、EXIF解析）
  - 测量导入组件（调用后端测量任务，自动载入结果）
  - 设计器（Konva）与掩码编辑（画笔/橡皮、导出掩码并上传）
  - 多部位选择与预览，支持导出生产 PDF（CMYK + 刀模）
- 后端（Node + Express）
  - 上传图片到 MinIO（S3 协议）
  - 创建处理与测量任务（BullMQ 队列），查询任务状态
  - 保存模板（包含设计与掩码/测量元数据）
  - 导出 PDF（CMYK + 刀模，pdfkit）
  - Socket.IO 实时推送（Redis pub/sub）
- 处理器（Node Worker）
  - 消费 image-processing / measurement-processing 队列
  - （示例）基础重采样与水印、测量 bbox 估算与物理尺寸估算
  - 可调用 Python 测量服务 /infer，获取分割与裁剪结果并写回数据库
- Python 测量服务（可选）
  - FastAPI，尝试使用 Detectron2（Mask R-CNN）或 OpenCV 回退完成分割
  - 上传裁剪图与掩码到 MinIO，返回 S3 keys/URLs
  - 支持 GPU（CUDA）镜像构建

---

## 目录结构（主要）

```
.
├─ frontend/                # React + Vite 前端
│  ├─ src/components/       # CaptureGuide / MeasurementImporter / MeasuredEditor / MultiPartEditor / MaskEditor ...
│  ├─ src/pages/DemoPage.tsx
│  └─ package.json
├─ backend/                 # Express + TypeScript 后端
│  ├─ src/index.ts          # 启动与路由挂载（uploads / templates / masks / measurements / export/pdf）
│  ├─ src/routes/           # 路由实现
│  ├─ src/workers/          # measurement_inference_worker.ts / measurement_processing_worker.ts
│  ├─ src/db.ts, src/s3.ts  # 数据库与 MinIO (S3) 封装
│  └─ package.json
├─ processor/               # （可复用或独立的）Node Worker
│  └─ src/worker.ts
├─ measurement_service/     # Python FastAPI 服务（Detectron2/OpenCV）
│  ├─ app/main.py, app/model.py
│  ├─ requirements.txt
│  ├─ Dockerfile            # CPU fallback
│  └─ Dockerfile.gpu        # GPU（CUDA + torch + detectron2）
├─ scripts/e2e_measurement_test.sh  # 端到端测试脚本（上传→测量→查询结果）
├─ docker-compose.yml
├─ docker-compose.override.yml      # 引入 measurement_service
├─ docker-compose.worker.override.yml  # 独立 worker 容器（复用 backend 镜像）
└─ openapi.yaml              # API 文档（后端与 Python 服务）
```

---

## 快速启动（Docker Compose）

1) 安装 Docker & Docker Compose（或 Docker Desktop）。

2) 在仓库根目录执行：
```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml up --build -d
```

3) 访问：
- 前端 UI: http://localhost:3000
- 后端 API health: http://localhost:4000/api/health
- MinIO Console: http://localhost:9001 （默认：minioadmin/minioadmin）
- PgAdmin（如果配置）: http://localhost:5050

如需独立运行测量 worker 容器（推荐）：
```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.worker.override.yml up --build -d
```

---

## 默认登录/访问信息

- MinIO 控制台
  - 用户: `minioadmin`
  - 密码: `minioadmin`
  - Web UI: http://localhost:9001

---

## 环境变量（核心）

后端/Worker：
- `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`: Postgres 连接
- `REDIS_HOST`, `REDIS_PORT`: Redis 连接
- `S3_ENDPOINT`: 例如 `http://minio:9000`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- `MEASUREMENT_SERVICE_URL`: 例如 `http://measurement-service:8000`（如启用 Python 服务）

前端（Vite，需以 `VITE_` 前缀）：
- `VITE_API_URL`: 后端 API 地址（如 `http://localhost:4000`，生产中建议自有域名）
- `VITE_MEASUREMENT_SERVICE_URL`（可选）
- `VITE_S3_ENDPOINT`, `VITE_S3_BUCKET`（如果前端直接读对象）

Python 测量服务：
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`

---

## 前端开发

进入 `frontend/`：
```bash
npm install
npm run dev        # 本地开发（Vite）
npm run build      # 构建（产物在 frontend/dist）
```

主要页面与组件：
- `src/pages/DemoPage.tsx`：拍照→尺寸输入→测量→编辑/导出 PDF（可导入 design_areas.json）
- `src/components/`：
  - `CaptureGuide.tsx`：摄像头预览、质量门控、自动上传并调用处理任务
  - `MeasurementImporter.tsx`：发起测量，socket/poll 等待结果
  - `MeasuredEditor.tsx`：物理尺寸画布、两点校准、保存模板
  - `MultiPartEditor.tsx`：多部位选择与预览、导出 PDF
  - `MaskEditor.tsx`：交互式掩码绘制并上传
  - `VehicleSizeForm.tsx`：输入 L/W/H 与单位

---

## 后端与 Worker

进入 `backend/`：
```bash
npm install
npm run dev   # 开发模式
npm run build && npm start
npm run migrate  # 运行简易迁移（添加/确保 templates.mask_key）
```

主要路由：
- `POST /api/uploads`：上传图片到 MinIO
- `POST /api/uploads/process`：创建处理任务（image-processing）
- `GET /api/uploads/jobs/{id}`：查询处理任务
- `POST /api/masks`：支持 JSON dataUrl 或 multipart 文件上传
- `GET /api/templates` / `POST /api/templates`：模板存取
- `POST /api/measurements` / `GET /api/measurements/{id}`：测量任务与查询
- `POST /api/export/pdf`：生成生产用 PDF（CMYK + 刀模），并上传到 MinIO

Worker（Node）：
- `measurement_processing_worker.ts`：消费测量队列，调用 `measurement_inference_worker.performMeasurement`（请求 Python /infer），写库并发布 Redis 通知
- Socket.IO：后端订阅 Redis channel `job_updates`，向前端广播 `job_update` 事件

---

## 测量服务（Python FastAPI）

目录：`measurement_service/`

CPU 版本构建与运行：
```bash
docker build -t measurement-service:local ./measurement_service
docker run --rm -p 8000:8000 \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin \
  -e S3_BUCKET=pod \
  measurement-service:local
```

GPU 版本（CUDA 11.7 + torch 1.13.1 示例）：
- Dockerfile: `measurement_service/Dockerfile.gpu`
```bash
docker build -t measurement-service:gpu -f measurement_service/Dockerfile.gpu measurement_service
docker run --gpus all --rm -p 8000:8000 \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin \
  -e S3_SECRET_KEY=minioadmin \
  -e S3_BUCKET=pod \
  measurement-service:gpu
```

接口：
- `POST /infer`（multipart/form-data）：
  - 字段：`file`（图片），`W`（车辆宽度，可选），`unit`（`mm|cm|m`，可选）
  - 返回：`rectified_key/rectified_url`、`mask_key/mask_url`、`bbox/polygon`、`physical_estimate`（若提供 `W`）

---

## 一键端到端测试（脚本）

`scripts/e2e_measurement_test.sh`（需要 curl / jq）：
```bash
chmod +x scripts/e2e_measurement_test.sh
./scripts/e2e_measurement_test.sh ./test.jpg
# 会执行：上传 → 发起测量 → 轮询结果 → 打印 JSON
```

---

## Vercel 部署（前端）

如果仅前端托管到 Vercel（后端部署在其它平台/服务器），建议：

- 在仓库根添加 `vercel.json`（示例）
```json
{
  "version": 2,
  "builds": [
    {
      "src": "frontend/package.json",
      "use": "@vercel/static-build",
      "config": { "distDir": "frontend/dist" }
    }
  ]
}
```

- 在 Vercel Project → Settings → Environment Variables 配置：
  - `VITE_API_URL`（后端地址）
  - 其他前端用到的 `VITE_` 前缀变量

也可以使用 GitHub Actions 自动部署到 Vercel（需在仓库 Secrets 添加 `VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID`）。详见 `deploy-vercel.yml` 示例（可按需添加）。

---

## 常见问题

- 前端无法访问 `/api`：
  - 前端需调用真实后端域名（`VITE_API_URL`），或在 `vercel.json` 用固定 URL 做 rewrite。
- 后端访问 MinIO 失败：
  - 确认 `S3_ENDPOINT` 包含协议（如 `http://minio:9000`）且 bucket 存在或后端已自动创建。
- Job 未被处理：
  - 查看 processor/worker 容器日志；确保 Redis 可用与队列名称一致；检查 `MEASUREMENT_SERVICE_URL`。
- PDF 未嵌入或颜色不对：
  - `pdfkit` 支持 CMYK，若需严格印刷配置（出血、刀模线宽、色彩管理），请与产线参数对齐并调整路由实现。

---

## 开发规划建议（MVP→增强）

- MVP（2–3 周）
  - 基础拍照上传、U2-Net/回退分割、车体 bbox 宽度→物理尺度
  - 前端两点校准、单部位裁剪与 PDF 导出
- 增强（4–8 周）
  - 语义部位分割与关键点检测；模板库与 PnP 位姿估计
  - AR/3D 预览；生产文件（CMYK、刀模、出血）自动化
- 生产化
  - GPU 自适应扩缩、监控与日志；隐私遮挡；合规与安全

---

## 开源协议

本项目为演示用途，默认使用 MIT（如需变更请在仓库根添加 LICENSE 并更新此段）。

---

## 参考

- JokeAPI（用于演示随机笑话组件）: https://v2.jokeapi.dev/
- Detectron2: https://detectron2.readthedocs.io/
- pdfkit: https://pdfkit.org/
- Konva / react-konva: https://konvajs.org/

如需我帮你“生成/调整某一部分文件或配置”（例如 vercel.json / deploy workflow / docker-compose 片段），请在 issue 或聊天中说明目标平台与服务部署方式，我会直接给出对应文件块。