// (This file is same as previous CaptureGuide but includes socket usage)
import React, { useEffect, useRef, useState } from "react";
import useCamera from "../hooks/useCamera";
import { analyzeImageBlob, ImageQuality } from "../utils/imageQuality";
import { parseExif, ExifInfo } from "../utils/exif";
import { getSocket } from "../libs/socket";

type ViewKey = "front" | "rear" | "left" | "right" | string;

export type CaptureResult = {
  view: ViewKey;
  file?: File;
  blobUrl?: string;
  upload?: { url: string; key: string } | null;
  quality?: ImageQuality;
  exif?: ExifInfo | null;
  flagged?: boolean;
  jobId?: number | null;
};

type Props = {
  views?: ViewKey[]; // default ['front','rear','left','right']
  onComplete?: (results: CaptureResult[]) => void;
  autoUpload?: boolean;
  processPollIntervalMs?: number;
  processTimeoutMs?: number;
};

export default function CaptureGuide({
  views = ["front", "rear", "left", "right"],
  onComplete,
  autoUpload = true,
  processPollIntervalMs = 1500,
  processTimeoutMs = 120_000
}: Props) {
  const [index, setIndex] = useState(0);
  const currentView = views[index];
  const [results, setResults] = useState<CaptureResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [gateLocked, setGateLocked] = useState(false);

  const { stream, start, stop, facingMode, toggleFacing } = useCamera();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    start().catch(() => {});
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      // payload: { jobId, status, result }
      const jobId = payload.jobId;
      setResults((prev) => {
        const copy = prev.slice();
        for (let i = 0; i < copy.length; i++) {
          if (copy[i] && copy[i].jobId === jobId) {
            const r = { ...copy[i] };
            if (payload.status === "done" && payload.result && payload.result.key && payload.result.url) {
              r.upload = { url: payload.result.url, key: payload.result.key || r.upload?.key || "" };
              r.jobId = jobId;
              r.quality = r.quality ?? r.quality;
            } else if (payload.status === "failed") {
              r.upload = null;
            }
            copy[i] = r;
            break;
          }
        }
        return copy;
      });
    };
    socket.on("job_update", handler);
    return () => {
      socket.off("job_update", handler);
    };
  }, []);

  async function handleCaptureFromCamera() {
    setBusy(true);
    setWarning(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("Camera not ready");
      let canvas = canvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvasRef.current = canvas;
      }
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(video, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob((b) => resolve(b), "image/jpeg", 0.95));
      if (!blob) throw new Error("Failed to capture image");
      await handleCapturedBlob(blob);
    } catch (err: any) {
      console.error("capture error", err);
      setWarning("拍照失败，请重试或使用文件选择上传。");
    } finally {
      setBusy(false);
    }
  }

  async function handleFileInput(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setWarning(null);
    try {
      await handleCapturedBlob(f);
    } finally {
      setBusy(false);
    }
  }

  async function handleCapturedBlob(blobOrFile: Blob | File) {
    const file = blobOrFile instanceof File ? blobOrFile : new File([blobOrFile], `${currentView}-${Date.now()}.jpg`, { type: "image/jpeg" });
    const exif = await parseExif(file);
    const quality = await analyzeImageBlob(file);
    if (quality.isBlurry || quality.isDark) {
      setGateLocked(true);
      setWarning(quality.isBlurry ? "检测到模糊，建议重拍以获得更清晰的图像。" : "图像偏暗，建议重拍。");
    } else {
      setGateLocked(false);
      setWarning(null);
    }
    const blobUrl = URL.createObjectURL(file);
    const newResult: CaptureResult = { view: currentView, file, blobUrl, quality, exif: exif ?? null, flagged: false, jobId: null };

    setResults((prev) => {
      const copy = [...prev];
      copy[index] = newResult;
      return copy;
    });

    if (autoUpload) {
      try {
        const upload = await uploadFileToApi(file, exif);
        // set upload url/key
        setResults((prev) => {
          const copy = [...prev];
          const r = copy[index] || { view: currentView };
          copy[index] = { ...r, file, blobUrl, quality, exif, upload };
          return copy;
        });

        // start processing job and obtain jobId
        const proc = await startProcess(upload.key);
        if (proc?.jobId) {
          setResults((prev) => {
            const copy = [...prev];
            const r = copy[index] || { view: currentView };
            copy[index] = { ...r, jobId: proc.jobId };
            return copy;
          });

          // subscribe to job via socket room (optional)
          try {
            const socket = getSocket();
            socket.emit("subscribe_job", proc.jobId);
          } catch {}

          // fallback: poll for a limited time (in case websocket not available)
          const processedUrl = await pollJobForResult(proc.jobId, processPollIntervalMs, processTimeoutMs);
          if (processedUrl) {
            setResults((prev) => {
              const copy = [...prev];
              const r = copy[index] || { view: currentView };
              copy[index] = { ...r, upload: { url: processedUrl, key: r.upload?.key ?? "" } };
              return copy;
            });
          }
        }
      } catch (err) {
        console.warn("upload/process failed", err);
        setResults((prev) => {
          const copy = [...prev];
          const r = copy[index] || { view: currentView };
          copy[index] = { ...r, upload: null };
          return copy;
        });
      }
    }
  }

  async function uploadFileToApi(file: File, exif?: any): Promise<{ url: string; key: string }> {
    const fd = new FormData();
    fd.append("file", file);
    if (exif) fd.append("metadata", JSON.stringify({ exif }));
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const json = await res.json();
    return { url: json.url, key: json.key };
  }

  async function startProcess(key: string): Promise<{ jobId?: number } | null> {
    const res = await fetch("/api/uploads/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, actions: ["resize", "segmentation"] })
    });
    if (!res.ok) {
      console.warn("startProcess failed", await res.text());
      return null;
    }
    return res.json();
  }

  async function pollJobForResult(jobId: number, intervalMs = 1500, timeoutMs = 120000): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`/api/uploads/jobs/${jobId}`);
        if (!r.ok) {
          await new Promise((r) => setTimeout(r, intervalMs));
          continue;
        }
        const j = await r.json();
        if (j.status === "done" && j.result && j.result.url) {
          return j.result.url;
        }
        if (j.status === "failed") return null;
      } catch (err) {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  function forceUse() {
    setResults((prev) => {
      const copy = [...prev];
      if (copy[index]) copy[index] = { ...copy[index], flagged: true };
      return copy;
    });
    setGateLocked(false);
    setWarning(null);
  }

  function retake() {
    setResults((prev) => {
      const copy = [...prev];
      copy[index] = undefined as any;
      return copy;
    });
    setGateLocked(false);
    setWarning(null);
  }

  function goNext() {
    if (gateLocked) {
      alert("当前照片质量不佳，请重拍或强制使用。");
      return;
    }
    if (index < views.length - 1) setIndex(index + 1);
    else onComplete?.(results);
  }

  function goPrev() {
    if (index > 0) setIndex(index - 1);
  }

  const currentResult = results[index];

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", fontFamily: "Arial, sans-serif" }}>
      <h2>拍照定制车贴 — 拍摄引导</h2>
      <p>当前视角：<strong>{currentView}</strong>（{index + 1}/{views.length}）</p>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: 520, border: "1px solid #ddd", padding: 8, borderRadius: 6 }}>
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000" }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div style={{
              position: "absolute", inset: 12, border: "2px dashed rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textShadow: "0 0 6px rgba(0,0,0,0.8)",
              pointerEvents: "none"
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700 }}>{currentView.toUpperCase()}</div>
                <div style={{ fontSize: 13 }}>请使车辆完整出现在框内，避免强逆光与明显模糊</div>
              </div>
            </div>

            {currentResult?.blobUrl && (
              <img src={currentResult.blobUrl} alt="preview" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={busy}>从相册选择</button>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFileInput} />
            <button onClick={toggleFacing} disabled={busy} title="切换摄像头">切换摄像头</button>
            <button onClick={handleCaptureFromCamera} disabled={busy || !!currentResult}>拍照</button>
            {currentResult && <button onClick={retake} disabled={busy}>重拍</button>}
            <div style={{ marginLeft: "auto" }}>
              <button onClick={goPrev} disabled={index === 0}>上一步</button>
              <button onClick={() => { if (!currentResult) { alert("请先拍照或选择图片"); return; } goNext(); }} style={{ marginLeft: 8 }}>
                {index < views.length - 1 ? "下一步" : "完成"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            {busy && <div>处理中…</div>}
            {warning && <div style={{ color: "#b44" }}>{warning}</div>}
            {gateLocked && (
              <div style={{ marginTop: 8 }}>
                <div>检测到图像质量问题：</div>
                <button onClick={retake} style={{ marginRight: 8 }}>重拍</button>
                <button onClick={forceUse}>仍然使用此图</button>
              </div>
            )}
            {currentResult?.quality && (
              <div style={{ fontSize: 13, color: "#333" }}>
                模糊度: {currentResult.quality.blurScore.toFixed(1)} ({currentResult.quality.isBlurry ? "模糊" : "清晰"}) · 亮度: {currentResult.quality.brightness.toFixed(0)} ({currentResult.quality.isDark ? "偏暗" : "亮度正常"})
              </div>
            )}
            {currentResult?.exif && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                EXIF: {currentResult.exif.make ?? ""} {currentResult.exif.model ?? ""} {currentResult.exif.latitude ? `· GPS(${currentResult.exif.latitude.toFixed(6)},${currentResult.exif.longitude?.toFixed(6)})` : ""}
              </div>
            )}
            {currentResult?.upload && (
              <div style={{ fontSize: 13, marginTop: 6 }}>
                已上传并处理: <a href={currentResult.upload.url} target="_blank" rel="noreferrer">查看</a>
              </div>
            )}
            {currentResult?.upload === null && (
              <div style={{ color: "#a33", fontSize: 13 }}>上传失败，请稍后重试。</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h4>拍摄进度</h4>
          <ul>
            {views.map((v, i) => {
              const r = results[i];
              return (
                <li key={v} style={{ marginBottom: 8 }}>
                  <strong>{v}</strong> — {r ? (r.upload ? "已上传/处理" : "已拍摄") : "未拍摄"}
                  {r?.quality && (
                    <div style={{ fontSize: 12, color: "#555" }}>
                      blur {r.quality.blurScore.toFixed(1)}, bright {Math.round(r.quality.brightness)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div style={{ marginTop: 12 }}>
            <strong>提示</strong>
            <ul style={{ fontSize: 13 }}>
              <li>尽量在白天或光线充足的环境拍摄。</li>
              <li>保持相机稳定，避免模糊。</li>
              <li>确保车牌、人像等隐私信息被自动遮挡或可手动编辑（模板编辑阶段）。</li>
            </ul>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={() => { onComplete?.(results); }} style={{ background: "#0b79f7", color: "#fff", padding: "8px 12px", borderRadius: 4 }}>
              跳过并提交当前已拍摄项
            </button>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}