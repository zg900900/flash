import React, { useEffect, useState } from "react";
import { getSocket } from "../libs/socket";

export type VehicleInput = {
  L?: number; // length
  W?: number; // width
  H?: number; // height
  unit?: "mm" | "cm" | "m";
  modelId?: string | null;
};

export type MeasurementPart = {
  name: string;
  polygon: Array<{ x: number; y: number }>;
  rectifiedUrl?: string;
  rectifiedKey?: string;
  rectifiedPx?: { w: number; h: number };
  physicalSize?: { width_m: number; height_m: number; area_m2: number };
  confidence?: number;
  error_estimate_cm?: number;
  maskUrl?: string;
  maskKey?: string;
};

export type MeasurementResult = {
  jobId: number;
  imageKey: string;
  vehicleDimensionsProvided?: { L?: number; W?: number; H?: number; unit?: string };
  pose?: any;
  parts: MeasurementPart[];
  overallConfidence?: number;
  notes?: string;
};

type Props = {
  imageKey: string; // existing uploaded image key, e.g. "uploads/xxx.jpg"
  vehicle?: VehicleInput;
  onDone?: (result: MeasurementResult) => void;
};

export default function MeasurementImporter({ imageKey, vehicle, onDone }: Props) {
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<MeasurementResult | null>(null);

  useEffect(() => {
    // subscribe to socket updates to update progress if connected
    const socket = getSocket();
    const handler = (payload: any) => {
      if (!payload || !payload.jobId) return;
      if (jobId && payload.jobId === jobId) {
        setStatus(payload.status || "updated");
        // if payload.result contains parts, we can set result early
        if (payload.result && payload.status === "done") {
          const prepared: MeasurementResult = {
            jobId: payload.jobId,
            imageKey,
            parts: payload.result.parts || [],
            overallConfidence: payload.result.overallConfidence
          };
          setResult(prepared);
          onDone?.(prepared);
        } else if (payload.status === "failed") {
          setError(String(payload.result?.error || "processing failed"));
        }
      }
    };
    socket.on("job_update", handler);
    return () => {
      socket.off("job_update", handler);
    };
  }, [jobId, imageKey, onDone]);

  async function startMeasurement() {
    setError(null);
    setStatus("queuing");
    setProgress(5);
    try {
      const body = { imageKey, vehicle };
      const res = await fetch("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setJobId(json.jobId);
      setStatus("queued");
      setProgress(10);
      // poll fallback: fetch status periodically if no socket update arrives
      pollForResult(json.jobId);
    } catch (err: any) {
      console.error("startMeasurement error", err);
      setError(String(err.message || err));
      setStatus("error");
    }
  }

  async function pollForResult(id: number) {
    const start = Date.now();
    const timeoutMs = 120000; // 2 minutes
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetch(`/api/measurements/${id}`);
        if (!r.ok) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        const j = await r.json();
        setStatus(j.status || "unknown");
        if (j.status === "done") {
          // normalize parts into MeasurementResult
          const res: MeasurementResult = {
            jobId: j.id,
            imageKey: j.payload?.imageKey || imageKey,
            vehicleDimensionsProvided: j.payload?.vehicle || vehicle,
            parts: (j.result?.parts || []).map((p: any) => p),
            overallConfidence: j.result?.overallConfidence,
            notes: j.result?.notes
          };
          setResult(res);
          setProgress(100);
          onDone?.(res);
          return;
        } else if (j.status === "failed") {
          setError("measurement failed");
          setStatus("failed");
          return;
        } else {
          // update progress indicator heuristically
          setProgress((prev) => Math.min(90, prev + Math.random() * 10));
        }
      } catch (e) {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setError("timeout waiting for measurement");
    setStatus("timeout");
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6 }}>
      <h3>测量并生成可设计区域</h3>
      <div>图片 Key: <code>{imageKey}</code></div>
      <div style={{ marginTop: 8 }}>
        <button onClick={startMeasurement} disabled={!!jobId && status !== "failed"}>开始测量</button>
      </div>

      {jobId && (
        <div style={{ marginTop: 8 }}>
          <div>Job ID: {jobId}</div>
          <div>Status: {status}</div>
          <div style={{ width: "100%", background: "#eee", height: 10, marginTop: 6 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#0b79f7" }} />
          </div>
        </div>
      )}

      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}

      {result && (
        <div style={{ marginTop: 8 }}>
          <h4>测量结果</h4>
          <div>Overall confidence: {result.overallConfidence ?? "N/A"}</div>
          <ul>
            {result.parts.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong> — {p.physicalSize ? `${(p.physicalSize.width_m*100).toFixed(1)}cm × ${(p.physicalSize.height_m*100).toFixed(1)}cm` : "无尺寸"}
                {p.rectifiedUrl && <div><a href={p.rectifiedUrl} target="_blank" rel="noreferrer">查看 rectified</a></div>}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => onDone?.(result)}>导入设计器</button>
          </div>
        </div>
      )}
    </div>
  );
}