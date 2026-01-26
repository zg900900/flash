import express from "express";
import PDFDocument from "pdfkit";
import fetch from "node-fetch";
import { uploadObject, ensureBucket } from "../s3";

const router = express.Router();

/**
 * Request JSON:
 * {
 *   name?: string,
 *   part: {
 *     rectifiedUrl?: string,
 *     physicalSize: { width_m: number, height_m: number },
 *     polygon?: Array<{x:number, y:number}> // assume rectified coords normalized to image pixel space of rectified image size
 *     rectifiedPx?: { w: number, h: number } // for polygon scaling to page
 *   },
 *   options?: {
 *     bleed_mm?: number,
 *     cmyk_background?: [c,m,y,k] // CMYK percentages 0-100
 *   }
 * }
 */
router.post("/pdf", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const { name, part, options } = req.body || {};
    if (!part || !part.physicalSize || typeof part.physicalSize.width_m !== "number" || typeof part.physicalSize.height_m !== "number") {
      return res.status(400).json({ error: "missing part.physicalSize (width_m, height_m)" });
    }
    const width_mm = part.physicalSize.width_m * 1000;
    const height_mm = part.physicalSize.height_m * 1000;
    const bleed_mm = options?.bleed_mm ?? 0;

    // Convert mm to PDF points (1 inch = 25.4 mm; 1 inch = 72 points)
    const mmToPt = (mm: number) => (mm / 25.4) * 72;
    const pageWpt = mmToPt(width_mm + bleed_mm * 2);
    const pageHpt = mmToPt(height_mm + bleed_mm * 2);

    // Prepare PDF
    const doc = new PDFDocument({ size: [pageWpt, pageHpt], margin: 0 });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", async () => {
      const buffer = Buffer.concat(chunks);
      await ensureBucket();
      const filename = `exports/${Date.now()}-${(name || part.name || "part")}.pdf`.replace(/[^a-zA-Z0-9_\-\.\/]/g, "_");
      const key = filename;
      const url = await uploadObject(key, buffer, "application/pdf");
      res.json({ key, url });
    });

    // Optional background fill (CMYK)
    if (options?.cmyk_background && Array.isArray(options.cmyk_background) && options.cmyk_background.length === 4) {
      const [c, m, y, k] = options.cmyk_background.map((v: number) => Math.max(0, Math.min(100, v)));
      doc.cmykFill(c / 100, m / 100, y / 100, k / 100);
      doc.rect(0, 0, pageWpt, pageHpt).fill();
    }

    // Draw rectified image scaled to page minus bleed
    const leftPt = mmToPt(bleed_mm);
    const topPt = mmToPt(bleed_mm);
    const availWpt = mmToPt(width_mm);
    const availHpt = mmToPt(height_mm);

    if (part.rectifiedUrl) {
      try {
        const imgResp = await fetch(part.rectifiedUrl);
        if (imgResp.ok) {
          const imgBuf = Buffer.from(await imgResp.arrayBuffer());
          doc.image(imgBuf, leftPt, topPt, { width: availWpt, height: availHpt });
        }
      } catch (err) {
        // ignore image failure
        console.warn("Failed to embed rectified image:", err);
      }
    }

    // Draw dieline (刀模) — CMYK Magenta stroke
    doc.cmykStroke(0, 1, 0, 0); // Magenta
    doc.lineWidth(1); // hairline
    if (Array.isArray(part.polygon) && part.polygon.length >= 2) {
      // Map polygon pixels to page points
      const rectPxW = part.rectifiedPx?.w || 1000;
      const rectPxH = part.rectifiedPx?.h || 1000;
      const scaleX = availWpt / rectPxW;
      const scaleY = availHpt / rectPxH;

      const first = part.polygon[0];
      doc.moveTo(leftPt + first.x * scaleX, topPt + first.y * scaleY);
      for (let i = 1; i < part.polygon.length; i++) {
        const p = part.polygon[i];
        doc.lineTo(leftPt + p.x * scaleX, topPt + p.y * scaleY);
      }
      doc.closePath().stroke();
    } else {
      // Fallback: draw outer rectangle as dieline
      doc.rect(leftPt, topPt, availWpt, availHpt).stroke();
    }

    doc.end();
  } catch (err) {
    console.error("export pdf error:", err);
    return res.status(500).json({ error: "export failed" });
  }
});

export default router;