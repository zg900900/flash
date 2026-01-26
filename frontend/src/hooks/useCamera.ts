import { useCallback, useEffect, useState } from "react";

export default function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const start = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode }
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(s);
      return s;
    } catch (err) {
      console.warn("getUserMedia failed", err);
      setStream(null);
      throw err;
    }
  }, [facingMode]);

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }, [stream]);

  const toggleFacing = useCallback(async () => {
    setFacingMode((f) => (f === "environment" ? "user" : "environment"));
    // restart stream with new facing mode
    try {
      stop();
    } catch {}
    // small delay to allow camera swap
    await new Promise((r) => setTimeout(r, 200));
    try {
      await start();
    } catch {}
  }, [start, stop]);

  // restart when facingMode changes
  useEffect(() => {
    // If a stream exists, restart with new facing
    if (!stream) return;
    // stop current and start new stream
    (async () => {
      try {
        stream.getTracks().forEach((t) => t.stop());
        const constraints: MediaStreamConstraints = { video: { facingMode } };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(s);
      } catch (err) {
        console.warn("restart with facingMode failed", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  return { stream, start, stop, facingMode, toggleFacing };
}