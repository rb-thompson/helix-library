import { createHash } from "node:crypto";
import { createReadStream, openSync, readSync, closeSync, statSync } from "node:fs";

/**
 * Full file hash for small files; size + head/tail sample for large files.
 */
export async function contentHash(
  filePath: string,
  sizeBytes: number,
  fullUnderBytes: number,
): Promise<string> {
  if (sizeBytes <= fullUnderBytes) {
    return hashStream(filePath);
  }
  return hashSampled(filePath, sizeBytes);
}

function hashStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function hashSampled(filePath: string, sizeBytes: number): string {
  const sample = 1024 * 1024; // 1 MiB head + 1 MiB tail
  const hash = createHash("sha256");
  hash.update(`size:${sizeBytes}\n`);

  const fd = openSync(filePath, "r");
  try {
    const head = Buffer.alloc(Math.min(sample, sizeBytes));
    readSync(fd, head, 0, head.length, 0);
    hash.update(head);

    if (sizeBytes > sample) {
      const tailLen = Math.min(sample, sizeBytes - sample);
      const tail = Buffer.alloc(tailLen);
      readSync(fd, tail, 0, tailLen, sizeBytes - tailLen);
      hash.update(tail);
    }
  } finally {
    closeSync(fd);
  }

  // Include mtime as a weak extra signal for sampled mode
  const st = statSync(filePath);
  hash.update(`mtime:${Math.trunc(st.mtimeMs)}\n`);
  return `sampled:${hash.digest("hex")}`;
}
