import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { Server } from "socket.io";
import { createServer } from "http";
import IORedis from "ioredis";
import uploads from "./routes/uploads";
import templates from "./routes/templates";
import masks from "./routes/masks";
import measurements from "./routes/measurements";
import exportRoute from "./routes/export";
import pool, { initDb } from "./db";
import { ensureBucket } from "./s3";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
// increase JSON limit to allow mask base64 uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const PORT = Number(process.env.PORT || 4000);

// ensure data dir exists
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Redis subscriber for job updates
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const redisSub = new IORedis({ host: REDIS_HOST, port: REDIS_PORT });

redisSub.subscribe("job_updates", (err) => {
  if (err) console.error("Redis subscribe error:", err);
  else console.log("Subscribed to job_updates channel");
});

redisSub.on("message", (channel, message) => {
  if (channel === "job_updates") {
    try {
      const data = JSON.parse(message);
      io.emit("job_update", data);
    } catch (err) {
      console.error("Error parsing job update:", err);
    }
  }
});

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// init db then routes
initDb().then(async () => {
  // ensure S3 bucket exists (best-effort)
  try {
    await ensureBucket();
    console.log("S3 bucket ensured.");
  } catch (err) {
    console.warn("S3 bucket ensure failed (proceeding):", err);
  }

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/uploads", uploads);
  app.use("/api/templates", templates);
  app.use("/api/masks", masks);
  app.use("/api/measurements", measurements);
  app.use("/api/export", exportRoute);

  httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}).catch((err) => {
  console.error("DB init error", err);
  process.exit(1);
});