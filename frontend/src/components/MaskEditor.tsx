import React, { useRef, useState } from "react";
import { Stage, Layer, Line, Image as KImage } from "react-konva";

type Props = {
  width?: number;
  height?: number;
  imageSrc?: string;
  initialStrokes?: Array<number[]>;
  onExportMask?: (uploadedUrl: string) => void; // now returns uploaded URL
};

export default function MaskEditor({ width = 800, height = 600, imageSrc, initialStrokes = [], onExportMask }: Props) {
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(20);
  const [strokes, setStrokes] = useState<Array<{ points: number[]; color: string; size: number }>>(
    initialStrokes.length ? initialStrokes.map((pts) => ({ points: pts, color: "black", size: brushSize })) : []
  );
  const isDrawingRef = useRef(false);
  const stageRef = useRef<any>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageObj(img);
    img.src = imageSrc;
    return () => { setImageObj(null); };
  }, [imageSrc]);

  function handleMouseDown(e: any) {
    isDrawingRef.current = true;
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    const newStroke = { points: [pos.x, pos.y], color: tool === "brush" ? "black" : "rgba(0,0,0,1)", size: brushSize };
    setStrokes((s) => [...s, newStroke]);
  }

  function handleMouseMove(e: any) {
    if (!isDrawingRef.current) return;
    const pos = e.target.getStage().getPointerPosition();
    if (!pos) return;
    setStrokes((s) => {
      const copy = s.slice();
      const last = copy[copy.length - 1];
      last.points = last.points.concat([pos.x, pos.y]);
      return copy;
    });
  }

  function handleMouseUp() {
    isDrawingRef.current = false;
  }

  function undo() {
    setStrokes((s) => s.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
  }

  async function exportMask() {
    if (!stageRef.current) return;
    // create a canvas-only representation where strokes are black on transparent
    const stage = stageRef.current;

    // We will set background white optionally, but for mask it's okay to use black strokes on white
    const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
    // upload to backend /api/masks
    try {
      const res = await fetch("/api/masks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, name: `mask-${Date.now()}.png` })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`mask upload failed: ${text}`);
      }
      const j = await res.json();
      onExportMask?.(j.url);
      alert("掩码已上传并保存。");
    } catch (err: any) {
      console.error("export/upload mask failed", err);
      alert("掩码上传失败，请重试。");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <label>
          工具:
          <select value={tool} onChange={(e) => setTool(e.target.value as any)} style={{ marginLeft: 6 }}>
            <option value="brush">画笔（添加）</option>
            <option value="eraser">橡皮（擦除）</option>
          </select>
        </label>
        <label style={{ marginLeft: 12 }}>
          笔刷大小:
          <input type="range" min={4} max={80} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} style={{ marginLeft: 6 }} />
          <span style={{ marginLeft: 6 }}>{brushSize}px</span>
        </label>
        <button onClick={undo}>撤销</button>
        <button onClick={clear}>清空</button>
        <button onClick={exportMask} style={{ marginLeft: "auto", background: "#0b79f7", color: "#fff" }}>保存并上传掩码</button>
      </div>

      <div style={{ border: "1px solid #ccc", width, height }}>
        <Stage
          width={width}
          height={height}
          ref={stageRef}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <Layer>
            {imageObj && <KImage image={imageObj} x={0} y={0} width={width} height={height} />}
            {strokes.map((s, i) => (
              <Line
                key={i}
                points={s.points}
                tension={0.2}
                stroke={tool === "eraser" ? "white" : "black"}
                strokeWidth={s.size}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={tool === "eraser" ? "destination-out" : "source-over"}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}