import * as exifr from "exifr";

export type ExifInfo = {
  latitude?: number;
  longitude?: number;
  orientation?: number | null;
  make?: string | null;
  model?: string | null;
  [k: string]: any;
};

export async function parseExif(blob: Blob): Promise<ExifInfo | null> {
  try {
    const data = await exifr.parse(blob, { gps: true });
    if (!data) return null;
    const lat = (data as any).latitude ?? (data as any).gps?.latitude;
    const lon = (data as any).longitude ?? (data as any).gps?.longitude;
    const orientation = (data as any).Orientation ?? (data as any).orientation;
    const make = (data as any).Make ?? null;
    const model = (data as any).Model ?? null;
    return { latitude: lat, longitude: lon, orientation, make, model, raw: data };
  } catch (err) {
    console.warn("exif parse failed", err);
    return null;
  }
}