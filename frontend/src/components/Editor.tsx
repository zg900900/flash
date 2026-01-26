import React, { useRef, useState } from "react";
import MaskEditor from "./MaskEditor";

type Props = {
  initialImageUrl?: string; // processed image url or uploaded blob url
  onSave?: (template: any) => void;
};

export default function Editor({ initialImageUrl, onSave }: Props) {
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialImageUrl);
  const [name, setName] = useState("");
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  function handleMaskExport(dataUrl: string) {
    setMaskDataUrl(dataUrl);
    alert("掩码已保存，可随模板一并提交。");
    setShowMaskEditor(false);
  }

  async function saveTemplate() {
    // gather template payload (design JSON stub + image + mask)
    const payload = {
      name: name || "untitled",
      design: { /* TODO: real design JSON from Konva */ },
      assets: imageUrl ? [imageUrl] : [],
      mask: maskDataUrl
    };
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      alert("保存失败");
      return;
    }
    const data = await res.json();
    onSave?.(data);
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h2>设计器（编辑并修正掩码）</h2>
      <div style={{ marginBottom: 12 }}>
        <input placeholder="模板名称" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => setShowMaskEditor(true)} style={{ marginLeft: 8 }}>修正掩码 / 手动绘制</button>
        <button onClick={saveTemplate} style={{ marginLeft: 8, background: "#0b79f7", color: "#fff" }}>保存模板</button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ border: "1px solid #ccc", width: 800, height: 600 }}>
            {imageUrl ? <img src={imageUrl} alt="design" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <div style={{ padding: 20 }}>没有加载初始图像</div>}
          </div>
        </div>

        <div style={{ width: 420 }}>
          <h4>掩码（Mask）</h4>
          {maskDataUrl ? (
            <div>
              <img src={maskDataUrl} alt="mask" style={{ width: "100%", border: "1px solid #ddd" }} />
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowMaskEditor(true)}>重新编辑掩码</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: "#666" }}>尚未创建掩码。你可以在此界面点击“修正掩码 / 手动绘制”以打开画笔编辑器。</div>
            </div>
          )}
        </div>
      </div>

      {showMaskEditor && (
        <div style={{ marginTop: 12 }}>
          <h3>掩码编辑器</h3>
          <MaskEditor width={1024} height={640} imageSrc={imageUrl} onExportMask={handleMaskExport} />
        </div>
      )}
    </div>
  );
}