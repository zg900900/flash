import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KImage, Rect, Circle, Line, Text } from "react-konva";

type MeasurementPart = {
  name: string;
  rectifiedUrl?: string;
  rectifiedPx?: { w: number; h: number };
  physicalSize?: { width_m: number; height_m: number; area_m2: number };
  maskUrl?: string;
};

type Props = {
  part: MeasurementPart;
  dpi?: number; // e.g., 300
  maxCanvasPx?: number; // cap to avoid huge canvases
  onSaveTemplate?: (payload: any) => void;
};

function useImage(url?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) { setImg(null); return; }
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = url;
    return () => { setImg(null); };
  }, [url]);
  return img;
}

export default function MeasuredEditor({ part, dpi = 300, maxCanvasPx = 1600, onSaveTemplate }: Props) {
  // physical size from measurement result (meters)
  const widthM = part.physicalSize?.width_m ?? 0.0;
  const heightM = part.physicalSize?.height_m ?? 0.0;

  // convert to mm
  const widthMM = Math.max(1, widthM * 1000);
  const heightMM = Math.max(1, heightM * 1000);

  // px per mm at given DPI (target production pixels)
  const pxPerMMTarget = dpi / 25.4; // pixels per mm for desired DPI

  // desired pixel size at production DPI (full-resolution target)
  const desiredPxW = Math.max(1, Math.round(widthMM * pxPerMMTarget));
  const desiredPxH = Math.max(1, Math.round(heightMM * pxPerMMTarget));

  // UI state: calibration and scaleFactor
  const [scaleFactor, setScaleFactor] = useState<number>(() => {
    // default scale to fit into maxCanvasPx
    const defaultScale = Math.min(1, maxCanvasPx / Math.max(desiredPxW, desiredPxH, 1));
    return defaultScale;
  });

  // calibration state (two canvas points)
  const [calPoints, setCalPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [realDistanceCm, setRealDistanceCm] = useState<number | null>(null);
  const [calibratedPxPerMM, setCalibratedPxPerMM] = useState<number | null>(null);

  // effective canvas pixel dimensions (scaled)
  const canvasW = Math.max(1, Math.round(desiredPxW * scaleFactor));
  const canvasH = Math.max(1, Math.round(desiredPxH * scaleFactor));

  const img = useImage(part.rectifiedUrl);
  const maskImg = useImage(part.maskUrl);

  const stageRef = useRef<any>(null);

  // Derived mapping (for export)
  const mapping = useMemo(() => {
    const pxPerMMCanvas = calibratedPxPerMM ?? (pxPerMMTarget * scaleFactor);
    return {
      dpi,
      pxPerMMCanvas,
      pxPerMMTarget,
      scaleFactor,
      desiredPxW,
      desiredPxH,
      canvasW,
      canvasH
    };
  }, [dpi, calibratedPxPerMM, pxPerMMTarget, scaleFactor, desiredPxW, desiredPxH, canvasW, canvasH]);

  useEffect(() => {
    // When calibratedPxPerMM or desired dims change, we may want to update scaleFactor so that
    // the UI canvas represents calibration proportionally. If user calibrated, compute scaleFactor = pxPerMMCanvas / pxPerMMTarget
    if (calibratedPxPerMM) {
      const newScale = calibratedPxPerMM / pxPerMMTarget;
      // clamp to reasonable values
      const clamped = Math.min(Math.max(newScale, 0.01), 4);
      setScaleFactor(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibratedPxPerMM]);

  function handleStageClick(e: any) {
    // only register clicks if image loaded
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    // push point
    setCalPoints((prev) => {
      if (prev.length >= 2) return [pos]; // reset if already two
      return [...prev, { x: pos.x, y: pos.y }];
    });
  }

  function clearCalibration() {
    setCalPoints([]);
    setRealDistanceCm(null);
    setCalibratedPxPerMM(null);
    // reset scale to fit
    const defaultScale = Math.min(1, maxCanvasPx / Math.max(desiredPxW, desiredPxH, 1));
    setScaleFactor(defaultScale);
  }

  function applyCalibration() {
    if (calPoints.length !== 2 || !realDistanceCm || realDistanceCm <= 0) {
      alert("请在画布上选择两个点并输入真实距离（cm）");
      return;
    }
    const dx = calPoints[1].x - calPoints[0].x;
    const dy = calPoints[1].y - calPoints[0].y;
    const distPxCanvas = Math.sqrt(dx * dx + dy * dy);
    const realMm = realDistanceCm * 10;
    const pxPerMmCanvas = distPxCanvas / realMm;
    setCalibratedPxPerMM(pxPerMmCanvas);
    // scaleFactor will be updated in effect
    alert(`校准成功：画布像素密度 ${pxPerMmCanvas.toFixed(3)} px/mm`);
  }

  async function exportTemplate() {
    // assemble template payload including mapping info and calibration metadata
    const payload = {
      name: `measured-${part.name}-${Date.now()}`,
      design: {},
      assets: [part.rectifiedUrl, part.maskUrl].filter(Boolean),
      measurement: {
        width_m: part.physicalSize?.width_m,
        height_m: part.physicalSize?.height_m,
        mapping
      },
      calibration: {
        calPoints,
        realDistanceCm,
        calibratedPxPerMM
      }
    };
    if (onSaveTemplate) onSaveTemplate(payload);
    else {
      try {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const js = await res.json();
        alert("模板已保存，id=" + js.id);
      } catch (err: any) {
        alert("保存模板失败: " + (err.message || err));
      }
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h3>物理尺寸画布 — {part.name}</h3>

      <div style={{ marginBottom: 8 }}>
        <strong>自动测量尺寸：</strong>
        {widthM ? `${(widthM*100).toFixed(1)} cm` : "未知"} × {heightM ? `${(heightM*100).toFixed(1)} cm` : "未知"}
        <span style={{ marginLeft: 12 }}>目标 DPI: {dpi} · UI scale: {scaleFactor.toFixed(3)} · px/mm (canvas): {(mapping.pxPerMMCanvas).toFixed(3)}</span>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div>
          <div style={{ border: "1px solid #ccc", width: canvasW, height: canvasH }}>
            <Stage width={canvasW} height={canvasH} ref={stageRef} onClick={handleStageClick}>
              <Layer>
                {img && <KImage image={img} x={0} y={0} width={canvasW} height={canvasH} />}
                {maskImg && <KImage image={maskImg} x={0} y={0} width={canvasW} height={canvasH} opacity={0.35} />}
                {/* draw calibration points and connecting line */}
                {calPoints.map((p, i) => (
                  <Circle key={`p${i}`} x={p.x} y={p.y} radius={6} fill={i===0 ? "lime" : "orange"} stroke="black" strokeWidth={1} />
                ))}
                {calPoints.length === 2 && (
                  <>
                    <Line points={[calPoints[0].x, calPoints[0].y, calPoints[1].x, calPoints[1].y]} stroke="yellow" strokeWidth={2} />
                    <Text text={`${Math.round(Math.hypot(calPoints[1].x-calPoints[0].x, calPoints[1].y-calPoints[0].y))} px`} x={(calPoints[0].x+calPoints[1].x)/2+6} y={(calPoints[0].y+calPoints[1].y)/2+6} fontSize={14} fill="white" />
                  </>
                )}
                <Rect x={0} y={0} width={canvasW} height={canvasH} stroke="rgba(0,0,0,0.08)" />
              </Layer>
            </Stage>
          </div>

          <div style={{ marginTop: 8 }}>
            <small>点击画布选择两个参考点（例如左右车身外沿），然后输入它们之间的真实距离来校准。</small>
          </div>
        </div>

        <div style={{ width: 320 }}>
          <div style={{ marginBottom: 8 }}>
            <label>真实距离 (cm): </label>
            <input type="number" value={realDistanceCm ?? ""} onChange={(e) => setRealDistanceCm(Number(e.target.value || 0))} style={{ width: 120, marginLeft: 8 }} />
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={applyCalibration} disabled={calPoints.length !== 2 || !(realDistanceCm && realDistanceCm>0)}>应用校准</button>
            <button onClick={clearCalibration}>清除校准</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <h4>高级</h4>
            <div style={{ fontSize: 13 }}>
              - 当前画布为缩放视图，导出时会以映射信息保存真实 px/mm 参数。<br/>
              - 若需要更高精度，请在两点校准后再次拍照或在不同视角重复校准。
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={exportTemplate} style={{ background: "#0b79f7", color: "#fff", padding: "8px 12px", borderRadius: 4 }}>
                导出为模板 / 保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}