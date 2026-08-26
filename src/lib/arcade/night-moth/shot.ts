/**
 * Night Moth screenshot payload — parse only. The API writes the file.
 */

export type ShotPayload = {
  dataUrl: string;
  bytes: Buffer;
  ext: "jpg" | "png";
  region: string;
  night: number;
};

const MAX_BYTES = 6 * 1024 * 1024;

export function slugRegion(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return s || "grounds";
}

export function parseShotBody(raw: unknown): ShotPayload {
  if (!raw || typeof raw !== "object") throw new Error("Screenshot body required");
  const r = raw as Record<string, unknown>;
  const dataUrl = typeof r.dataUrl === "string" ? r.dataUrl : "";
  const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Expected a JPEG or PNG data URL");
  const ext: "jpg" | "png" = m[1] === "png" ? "png" : "jpg";
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length < 64) throw new Error("Screenshot too small");
  if (bytes.length > MAX_BYTES) throw new Error("Screenshot too large");
  const nightRaw = typeof r.night === "number" ? r.night : Number(r.night);
  const night = Number.isFinite(nightRaw) ? Math.max(0, Math.min(40, Math.round(nightRaw))) : 1;
  const region = slugRegion(typeof r.region === "string" ? r.region : "grounds");
  return { dataUrl, bytes, ext, region, night };
}

export function shotFilename(region: string, night: number, ext: "jpg" | "png", now = Date.now()): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `night-moth-${stamp}-n${night}-${region}.${ext}`;
}

export const SHOT_TAGS = ["night-moth", "screenshot", "arcade"] as const;
