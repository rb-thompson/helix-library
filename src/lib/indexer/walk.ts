import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";

export interface WalkedFile {
  absPath: string;
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
  ctimeMs: number;
}

export interface WalkOptions {
  root: string;
  ignore: string[];
  maxFileBytes: number;
  onSkipped?: (reason: "ignored" | "too_large" | "not_file", absPath: string) => void;
}

/**
 * Depth-first walk with ignore globs. Yields regular files only.
 */
export async function* walkFiles(
  options: WalkOptions,
): AsyncGenerator<WalkedFile> {
  const { root, ignore, maxFileBytes, onSkipped } = options;
  const isIgnored = picomatch(ignore, {
    dot: true,
    nobrace: false,
  });

  async function* visit(dir: string): AsyncGenerator<WalkedFile> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relFromRoot = path.relative(root, absPath);
      // Match against path with forward slashes for consistent globs
      const relPosix = relFromRoot.split(path.sep).join("/");

      if (isIgnored(relPosix) || isIgnored(absPath) || isIgnored(`**/${relPosix}`)) {
        onSkipped?.("ignored", absPath);
        continue;
      }

      // Also ignore well-known heavy dirs by name even if patterns miss
      if (
        entry.isDirectory() &&
        (entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".next" ||
          entry.name === "target")
      ) {
        onSkipped?.("ignored", absPath);
        continue;
      }

      if (entry.isDirectory()) {
        yield* visit(absPath);
        continue;
      }

      if (!entry.isFile()) {
        onSkipped?.("not_file", absPath);
        continue;
      }

      let st;
      try {
        st = await stat(absPath);
      } catch {
        continue;
      }

      if (!st.isFile()) {
        onSkipped?.("not_file", absPath);
        continue;
      }

      if (st.size > maxFileBytes) {
        onSkipped?.("too_large", absPath);
        continue;
      }

      yield {
        absPath,
        relPath: relFromRoot,
        sizeBytes: st.size,
        mtimeMs: Math.trunc(st.mtimeMs),
        ctimeMs: Math.trunc(st.ctimeMs),
      };
    }
  }

  yield* visit(root);
}
