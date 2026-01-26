import React, { useState } from "react";
import MeasuredEditor from "./MeasuredEditor";

type Part = {
  name: string;
  rectifiedUrl?: string;
  rectifiedPx?: { w: number; h: number };
  physicalSize?: { width_m: number; height_m: number; area_m2?: number };
  maskUrl?: string;
  polygon?: Array<{ x: number; y: number }>;
};

type Props = {
  parts: Part[];
};

export default function MultiPartEditor({ parts }: Props) {
  const [idx, setIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const selected = parts[idx];

  async function exportPDF() {
    if (!selected?.physicalSize) {
      alert("当前部位缺少物理尺寸，无法导出 PDF");
      return;
    }
    setExporting(true);
    try {
      const body = {
        name: `part-${selected.name}`,
        part: {
          rectifiedUrl: selected.rectifiedUrl,
          physicalSize: selected.physicalSize,
          polygon: selected.polygon,
          rectifiedPx: selected.rectifiedPx
        },
        options: {
          bleed_mm: 3, // example bleed
          cmyk_background: [0, 0, 0, 0] // white
        }
      };
      const resp = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error(await resp.text());
      const j = await resp.json();
      if (j.url) {
        window.open(j.url, "_blank");
      } else {
        alert("导出成功，但未返回 URL");
      }
    } catch (err: any) {
      alert("导出失败: " + (err.message || err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ width: 280 }}>
        <h4>部位列表</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {parts.map((p, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <button
                onClick={() => setIdx(i)}
                style={{ width: "100%", textAlign: "left", padding: 6, background: i === idx ? "#e6f0ff" : "#f5f5f5", border: "1px solid #ddd" }}
              >
                {p.name} · {p.physicalSize ? `${(p.physicalSize.width_m*100).toFixed(1)}cm × ${(p.physicalSize.height_m*100).toFixed(1)}cm` : "未知尺寸"}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 12 }}>
          <button onClick={exportPDF} disabled={exporting} style={{ background: "#0b79f7", color: "#fff", padding: "8px 12px", borderRadius: 4 }}>
            {exporting ? "导出中…" : "导出生产 PDF（CMYK + 刀模）"}
          </button>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        {selected ? <MeasuredEditor part={selected} /> : <div>请选择部位</div>}
      </div>
    </div>
  );
}