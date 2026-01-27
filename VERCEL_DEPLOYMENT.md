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
   
   #### 方式1: 使用 GitHub Actions 自动部署（推荐）
   
   已配置 GitHub Actions 工作流（`.github/workflows/vercel-deploy.yml`），可自动部署到 Vercel。
   
   **设置步骤：**
   
   a. 在 Vercel Dashboard 中创建项目并获取必需的信息：
      - 访问 https://vercel.com/account/tokens 创建一个新的 token
      - 在项目设置中找到 Project ID
      - 在账户设置中找到 Organization ID（Team ID）
   
   b. 在 GitHub 仓库中添加以下 Secrets（Settings → Secrets and variables → Actions）：
      - `VERCEL_TOKEN`: 你的 Vercel token
      - `VERCEL_ORG_ID`: 你的 Vercel Organization/Team ID
      - `VERCEL_PROJECT_ID`: 你的 Vercel Project ID
   
   c. 推送代码到 main 分支，GitHub Actions 将自动部署
   
   d. 也可以手动触发部署：
      - 进入 GitHub Actions 标签页
      - 选择 "Deploy to Vercel" 工作流
      - 点击 "Run workflow"
   
   #### 方式2: 使用 Vercel CLI 手动部署
   ```bash
   npm i -g vercel
   cd frontend
   vercel --prod
   ```

   #### 方式3: 连接 GitHub 仓库到 Vercel
   在 Vercel Dashboard 导入项目，Vercel 会自动检测并部署

### 替代方案

如果不使用 Vercel rewrites，可以：

1. 直接在前端代码中配置后端 URL（通过环境变量）
2. 使用 CORS 允许前端跨域访问后端
3. 在后端前添加反向代理（如 Nginx）

### 本地开发

本地开发时无需修改 vercel.json，Vite 的开发服务器已配置代理（见 `frontend/vite.config.ts`）
