import React, { useState } from "react";
import MeasurementImporter, { MeasurementResult } from "../components/MeasurementImporter";
import MeasuredEditor from "../components/MeasuredEditor";
import CaptureGuide from "../components/CaptureGuide";
import VehicleSizeForm, { VehicleInput } from "../components/VehicleSizeForm";
import DesignAreasImporter from "../components/DesignAreasImporter";
import MultiPartEditor from "../components/MultiPartEditor";

export default function DemoPage() {
  const [step, setStep] = useState<"capture"|"measure"|"editor">("capture");
  const [selectedImageKey, setSelectedImageKey] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<VehicleInput | undefined>({ W: 1800, unit: "mm" });
  const [measurement, setMeasurement] = useState<MeasurementResult | null>(null);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <DesignAreasImporter onImported={(parts) => {
          setMeasurement({ jobId: -1, imageKey: "", parts, overallConfidence: 1.0 } as any);
          setStep("editor");
        }} />
      </div>

      {step === "capture" && (
        <div>
          <CaptureGuide
            onComplete={(results: any[]) => {
              const uploaded = results.find((r) => r && r.upload && r.upload.key);
              const key = uploaded?.upload?.key;
              if (key) {
                setSelectedImageKey(key);
                setStep("measure");
              } else {
                alert("未检测到已上传的图片，请先上传");
              }
            }}
          />
        </div>
      )}

      {step === "measure" && selectedImageKey && (
        <div>
          <button onClick={() => setStep("capture")}>返回拍摄</button>
          <div style={{ marginTop: 12 }}>
            <VehicleSizeForm initial={vehicle} onSubmit={(v) => setVehicle(v)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <MeasurementImporter
              imageKey={selectedImageKey}
              vehicle={vehicle}
              onDone={(res) => {
                setMeasurement(res);
                setStep("editor");
              }}
            />
          </div>
        </div>
      )}

      {step === "editor" && measurement && measurement.parts && measurement.parts.length > 0 && (
        <div>
          <button onClick={() => setStep("measure")}>返回测量</button>
          <div style={{ marginTop: 12 }}>
            {measurement.parts.length > 1
              ? <MultiPartEditor parts={measurement.parts as any} />
              : <MeasuredEditor part={measurement.parts[0] as any} />}
          </div>
        </div>
      )}
    </div>
  );
}