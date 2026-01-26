export type ImageQuality = {
  blurScore: number; // higher => clearer
  brightness: number; // 0-255 average
  isBlurry: boolean;
  isDark: boolean;
};

function imageToCanvas(img: HTMLImageElement | HTMLVideoElement | ImageBitmap, maxW = 1280) {
  const canvas = document.createElement("canvas");
  const w = (img as HTMLVideoElement).videoWidth || (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width || maxW;
  const h = (img as HTMLVideoElement).videoHeight || (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height || Math.round(w * 0.75);
  const scale = Math.min(1, maxW / w);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img as any, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function analyzeImageBlob(blob: Blob): Promise<ImageQuality> {
  const img = await createImageBitmap(blob);
  const canvas = imageToCanvas(img, 800);
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { blurScore, brightness } = analyzeImageData(imageData);
  const isBlurry = blurScore < 40; // threshold, tuneable
  const isDark = brightness < 60; // threshold
  return { blurScore, brightness, isBlurry, isDark };
}

function analyzeImageData(imageData: ImageData) {
  const { data, width, height } = imageData;
  // compute grayscale
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[j] = v;
    sum += v;
  }
  const brightness = sum / (width * height);

  // Laplacian kernel for edge detection/variance -> blur metric
  // kernel:
  // 0  1  0
  // 1 -4  1
  // 0  1  0
  const lap = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const v = (gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1]) - 4 * gray[idx];
      lap[idx] = v;
    }
  }
  // variance of laplacian
  let mean = 0;
  let cnt = 0;
  for (let i = 0; i < lap.length; i++) {
    mean += lap[i];
    cnt++;
  }
  mean = mean / cnt;
  let variance = 0;
  for (let i = 0; i < lap.length; i++) {
    const d = lap[i] - mean;
    variance += d * d;
  }
  variance = variance / cnt;
  const blurScore = variance; // higher variance -> more edges -> sharper

  return { blurScore, brightness };
}