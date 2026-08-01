import path from "node:path";
import type { ItemKind } from "@/lib/types";

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "scala",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "r",
  "lua",
  "vim",
  "toml",
  "yaml",
  "yml",
  "json",
  "jsonc",
  "lock",
  "gradle",
  "cmake",
  "makefile",
  "dockerfile",
]);

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "rst",
  "org",
  "log",
  "csv",
  "tsv",
  "ini",
  "cfg",
  "conf",
  "env",
  "gitignore",
  "editorconfig",
]);

const DOCUMENT_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "epub",
]);

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "heic",
  "avif",
]);

const VIDEO_EXT = new Set([
  "mp4",
  "mkv",
  "webm",
  "mov",
  "avi",
  "m4v",
  "wmv",
  "flv",
]);

const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "wma",
  "opus",
]);

const ARCHIVE_EXT = new Set([
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "zst",
]);

export function extensionOf(filePath: string): string | null {
  const base = path.basename(filePath);
  if (base.startsWith(".") && !base.includes(".", 1)) {
    return base.slice(1).toLowerCase() || null;
  }
  const ext = path.extname(base).replace(/^\./, "").toLowerCase();
  return ext || null;
}

export function classifyKind(filePath: string, mime: string | null): ItemKind {
  const ext = extensionOf(filePath) ?? "";

  if (IMAGE_EXT.has(ext) || mime?.startsWith("image/")) return "image";
  if (VIDEO_EXT.has(ext) || mime?.startsWith("video/")) return "video";
  if (AUDIO_EXT.has(ext) || mime?.startsWith("audio/")) return "audio";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (DOCUMENT_EXT.has(ext) || mime === "application/pdf") return "document";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext) || mime?.startsWith("text/")) return "text";

  // Common basenames without extension
  const base = path.basename(filePath).toLowerCase();
  if (
    base === "makefile" ||
    base === "dockerfile" ||
    base === "license" ||
    base === "readme"
  ) {
    return base === "makefile" || base === "dockerfile" ? "code" : "text";
  }

  return "other";
}
