import { execFileSync } from "node:child_process";
import { commandExists } from "@/lib/indexer/enrich";

export type ExifField = { label: string; value: string };

export type ExifResult =
  | { available: true; fields: ExifField[]; rawKeys: number }
  | { available: false; reason: string };

const PREFERRED_KEYS: Array<{ key: string; label: string }> = [
  { key: "DateTimeOriginal", label: "Taken" },
  { key: "CreateDate", label: "Created" },
  { key: "Make", label: "Camera make" },
  { key: "Model", label: "Camera model" },
  { key: "LensModel", label: "Lens" },
  { key: "FocalLength", label: "Focal length" },
  { key: "FNumber", label: "Aperture" },
  { key: "ExposureTime", label: "Shutter" },
  { key: "ISO", label: "ISO" },
  { key: "GPSPosition", label: "GPS" },
  { key: "GPSLatitude", label: "Latitude" },
  { key: "GPSLongitude", label: "Longitude" },
  { key: "ImageWidth", label: "Width" },
  { key: "ImageHeight", label: "Height" },
  { key: "Orientation", label: "Orientation" },
  { key: "ColorSpace", label: "Color space" },
  { key: "Software", label: "Software" },
  { key: "Artist", label: "Artist" },
  { key: "Copyright", label: "Copyright" },
  { key: "Duration", label: "Duration" },
  { key: "VideoFrameRate", label: "Frame rate" },
  { key: "AudioFormat", label: "Audio format" },
  { key: "MIMEType", label: "MIME" },
  { key: "FileType", label: "File type" },
];

/**
 * Read EXIF/metadata via system exiftool when installed.
 * Graceful if missing or on parse failure — never throws to callers.
 */
export function readExif(filePath: string): ExifResult {
  if (!commandExists("exiftool")) {
    return {
      available: false,
      reason:
        "exiftool is not installed. Optional: sudo apt install libimage-exiftool-perl — then re-open this item.",
    };
  }

  try {
    const out = execFileSync(
      "exiftool",
      ["-json", "-n", "-coordFormat", "%.6f", filePath],
      { encoding: "utf8", timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out) as Array<Record<string, unknown>>;
    const row = parsed[0];
    if (!row || typeof row !== "object") {
      return { available: false, reason: "No metadata returned." };
    }

    const fields: ExifField[] = [];
    const seen = new Set<string>();

    for (const { key, label } of PREFERRED_KEYS) {
      if (row[key] == null || row[key] === "") continue;
      fields.push({ label, value: String(row[key]) });
      seen.add(key);
    }

    // A few extra interesting keys not in the preferred list
    for (const [key, val] of Object.entries(row)) {
      if (seen.has(key)) continue;
      if (val == null || val === "") continue;
      if (
        [
          "SourceFile",
          "ExifToolVersion",
          "Directory",
          "FileName",
          "FilePermissions",
          "FileInodeChangeDate",
        ].includes(key)
      ) {
        continue;
      }
      if (fields.length >= 28) break;
    }

    return {
      available: true,
      fields,
      rawKeys: Object.keys(row).length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `exiftool failed: ${message.slice(0, 200)}`,
    };
  }
}
