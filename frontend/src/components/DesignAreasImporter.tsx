import React, { useState } from "react";

type DesignPart = {
  name: string;
  polygon?: Array<{ x: number; y: number }>;
  rectifiedUrl?: string;
  rectifiedPx?: { w: number; h: number };
  physicalSize?: { width_m: number; height_m: number; area_m2?: number };
  maskUrl?: string;
};

type Props = {
  onImported?: (parts: DesignPart[]) => void;
};

export default function DesignAreasImporter({ onImported }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const parts: DesignPart[] = json.parts || json.result?.parts || [];
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new Error("未找到 parts 数据");
      }
      onImported?.(parts);
      setError(null);
    } catch (err: any) {
      setError(err.message || String(err));
    }
  }

  return (
    <div style={{ border: "1px dashed #bbb", padding: 12, borderRadius: 6 }}>
      <div>导入 design_areas.json：</div>
      <input type="file" accept="application/json" onChange={handleFileSelect} />
      {error && <div style={{ color: "red", marginTop: 6 }}>{error}</div>}
    </div>
  );
}