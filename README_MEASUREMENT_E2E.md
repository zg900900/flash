```markdown
# Measurement E2E Quick Start

1) Build and run with override
   docker-compose -f docker-compose.yml -f docker-compose.override.yml up --build -d

2) Open frontend at http://localhost:3000:
   - 拍照上传 => 输入车辆尺寸 => 开始测量 => 等待完成 => 打开编辑器
   - 或使用“导入 design_areas.json”直接进入编辑器

3) 后端/processor：
   - measurement-processing worker 会调用 measurement_service /infer
   - measurement_service 会把 rectified/mask 上传到 MinIO 并返回 key/url
   - 后端 jobs 表更新，Redis 发布 job_updates，经 Socket.IO 推送到前端

4) 调试：
   - docker-compose logs backend --tail=200 -f
   - docker-compose logs processor --tail=200 -f
   - docker-compose logs measurement-service --tail=200 -f
   - MinIO 控制台: http://localhost:9001 (minioadmin/minioadmin)
```