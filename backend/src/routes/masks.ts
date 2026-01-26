import express from "express";
import multer from "multer";
import { uploadObject, ensureBucket } from "../s3";
import pool from "../db";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/masks
 * Accepts either:
 *  - multipart/form-data with field "file" (binary PNG)
 *  - JSON { dataUrl, name } where dataUrl is data:image/png;base64,...
 */
router.post("/", async (req, res, next) => {
  // try JSON first (bodyParser already applied)
  if (req.is("application/json")) {
    const { dataUrl, name } = req.body;
    if (!dataUrl) return res.status(400).json({ error: "missing dataUrl" });
    try {
      await ensureBucket();
      const matched = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
      if (!matched) return res.status(400).json({ error: "invalid dataUrl" });
      const contentType = matched[1];
      const b64 = matched[2];
      const buffer = Buffer.from(b64, "base64");
      const filename = name ? name.replace(/[^a-zA-Z0-9_\\-\\.]/g, "_") : `mask-${Date.now()}.png`;
      const key = `masks/${Date.now()}-${filename}`;
      const url = await uploadObject(key, buffer, contentType);
      return res.json({ url, key });
    } catch (err) {
      console.error("masks upload error json", err);
      return res.status(500).json({ error: "mask upload failed" });
    }
  } else {
    // delegate to multer for multipart
    upload.single("file")(req as any, res as any, async (err: any) => {
      if (err) {
        console.error("multer error", err);
        return res.status(400).json({ error: "file upload error" });
      }
      const f = (req as any).file;
      if (!f) return res.status(400).json({ error: "missing file" });
      try {
        await ensureBucket();
        const filename = f.originalname || `mask-${Date.now()}.png`;
        const key = `masks/${Date.now()}-${filename.replace(/[^a-zA-Z0-9_\\-\\.]/g, "_")}`;
        const url = await uploadObject(key, f.buffer, f.mimetype || "image/png");
        return res.json({ url, key });
      } catch (e) {
        console.error("masks upload error multipart", e);
        return res.status(500).json({ error: "mask upload failed" });
      }
    });
  }
});

export default router;