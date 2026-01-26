# Vercel 部署说明

## 注意事项

`vercel.json` 文件包含 Vercel 部署配置，但需要根据实际后端部署地址进行修改。

### 必须修改的配置

在 `vercel.json` 中，将以下占位符 URL 替换为你的实际后端地址：

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://your-backend-domain.com/api/:path*"  // 修改这里
    },
    {
      "source": "/socket.io/:path*",
      "destination": "https://your-backend-domain.com/socket.io/:path*"  // 修改这里
    }
  ]
}
```

### 部署步骤

1. **部署后端**
   首先确保后端已部署到可访问的域名（如 Railway、Render、AWS 等）

2. **更新 vercel.json**
   将 `backend.example.com` 替换为实际的后端域名

3. **配置环境变量**
   在 Vercel 项目设置中添加：
   ```
   VITE_API_URL=https://your-backend-domain.com
   VITE_S3_ENDPOINT=https://your-minio-domain.com
   VITE_S3_BUCKET=pod
   ```

4. **部署到 Vercel**
   ```bash
   # 方式1: 使用 Vercel CLI
   npm i -g vercel
   vercel --prod

   # 方式2: 连接 GitHub 仓库到 Vercel
   # 在 Vercel Dashboard 导入项目
   ```

### 替代方案

如果不使用 Vercel rewrites，可以：

1. 直接在前端代码中配置后端 URL（通过环境变量）
2. 使用 CORS 允许前端跨域访问后端
3. 在后端前添加反向代理（如 Nginx）

### 本地开发

本地开发时无需修改 vercel.json，Vite 的开发服务器已配置代理（见 `frontend/vite.config.ts`）
