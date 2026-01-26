import React, { useState } from "react";

export type VehicleInput = {
  L?: number;
  W?: number;
  H?: number;
  unit?: "mm" | "cm" | "m";
  modelId?: string | null;
};

type Props = {
  initial?: VehicleInput;
  onSubmit?: (vehicle: VehicleInput) => void;
};

export default function VehicleSizeForm({ initial, onSubmit }: Props) {
  const [L, setL] = useState<number | undefined>(initial?.L);
  const [W, setW] = useState<number | undefined>(initial?.W);
  const [H, setH] = useState<number | undefined>(initial?.H);
  const [unit, setUnit] = useState<"mm" | "cm" | "m">(initial?.unit || "mm");
  const [modelId, setModelId] = useState<string>(initial?.modelId || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit?.({ L, W, H, unit, modelId: modelId || undefined });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <label>车型/型号</label><br />
        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="VIN / model code (optional)" />
      </div>
      <div>
        <label>长 (L)</label><br />
        <input type="number" step="0.01" value={L ?? ""} onChange={(e) => setL(Number(e.target.value || 0))} placeholder={`单位:${unit}`} />
      </div>
      <div>
        <label>宽 (W)</label><br />
        <input type="number" step="0.01" value={W ?? ""} onChange={(e) => setW(Number(e.target.value || 0))} placeholder={`单位:${unit}`} />
      </div>
      <div>
        <label>高 (H)</label><br />
        <input type="number" step="0.01" value={H ?? ""} onChange={(e) => setH(Number(e.target.value || 0))} placeholder={`单位:${unit}`} />
      </div>
      <div>
        <label>单位</label><br />
        <select value={unit} onChange={(e) => setUnit(e.target.value as any)}>
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
      </div>
      <button type="submit" style={{ background: "#0b79f7", color: "#fff", padding: "6px 12px", borderRadius: 4 }}>确定尺寸</button>
    </form>
  );
}