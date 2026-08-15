/**
 * CLI: npm run restore
 *   (no args)              list jail archives
 *   --inspect <name>       preview + mint session (no apply)
 *   --name <name> --phrase RESTORE   apply (thumbs on, roots off)
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listBackups } from "../src/lib/backup/list";
import { inspectBackup, restoreLiveStats } from "../src/lib/backup/inspect";
import { applyRestore } from "../src/lib/backup/restore";
import { mintRestoreSession } from "../src/lib/backup/session";

type CliArgs = {
  inspect?: string;
  name?: string;
  phrase?: string;
  noThumbs: boolean;
  applyRoots: boolean;
  help: boolean;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run restore",
    "  npm run restore -- --inspect <archive.tar.gz>",
    "  npm run restore -- --name <archive.tar.gz> --phrase RESTORE [--no-thumbs] [--apply-roots]",
  ].join("\n");
}

function takeFlagValue(
  argv: string[],
  i: number,
  flag: string,
): { value: string; next: number } {
  const cur = argv[i]!;
  if (cur.startsWith(`${flag}=`)) {
    const value = cur.slice(flag.length + 1);
    if (!value) throw new Error(`usage: ${flag} <name>`);
    return { value, next: i };
  }
  const value = argv[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`usage: ${flag} <name>`);
  }
  return { value, next: i + 1 };
}

export function parseRestoreCliArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    noThumbs: false,
    applyRoots: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--no-thumbs") {
      out.noThumbs = true;
    } else if (a === "--apply-roots") {
      out.applyRoots = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--inspect" || a.startsWith("--inspect=")) {
      const taken = takeFlagValue(argv, i, "--inspect");
      out.inspect = taken.value;
      i = taken.next;
    } else if (a === "--name" || a.startsWith("--name=")) {
      const taken = takeFlagValue(argv, i, "--name");
      out.name = taken.value;
      i = taken.next;
    } else if (a === "--phrase" || a.startsWith("--phrase=")) {
      const taken = takeFlagValue(argv, i, "--phrase");
      out.phrase = taken.value;
      i = taken.next;
    } else {
      throw new Error(`Unknown argument: ${a}\n${usage()}`);
    }
  }
  return out;
}

function printPreview(
  preview: Awaited<ReturnType<typeof inspectBackup>>,
  extra?: { confirmToken?: string; live?: ReturnType<typeof restoreLiveStats> },
): void {
  console.log(
    JSON.stringify(
      {
        preview,
        ...(extra?.confirmToken ? { confirmToken: extra.confirmToken } : {}),
        ...(extra?.live ? { live: extra.live } : {}),
      },
      null,
      2,
    ),
  );
}

export async function runRestoreCli(argv: string[]): Promise<number> {
  const args = parseRestoreCliArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  if (args.inspect) {
    const preview = await inspectBackup(args.inspect);
    const session = mintRestoreSession({
      name: preview.name,
      previewHash: preview.previewHash,
    });
    printPreview(preview, {
      confirmToken: session.token,
      live: restoreLiveStats(),
    });
    return 0;
  }

  if (args.name) {
    const preview = await inspectBackup(args.name);
    printPreview(preview, { live: restoreLiveStats() });
    if (args.phrase !== "RESTORE") {
      console.error("pass --phrase RESTORE");
      return 1;
    }
    console.log(
      `Applying ${preview.name} (thumbs=${!args.noThumbs}, roots=${args.applyRoots})…`,
    );
    const result = await applyRestore({
      name: preview.name,
      includeThumbs: !args.noThumbs,
      applyLocationRoots: args.applyRoots,
    });
    console.log(`\nOK undo=${result.undoBackup} items=${result.itemCount} job=${result.jobId}`);
    return 0;
  }

  if (args.phrase || args.noThumbs || args.applyRoots) {
    console.error("pass --name <archive.tar.gz> --phrase RESTORE");
    console.error(usage());
    return 1;
  }

  const backups = listBackups();
  if (backups.length === 0) {
    console.log("No backup archives in exports.");
    return 0;
  }
  for (const b of backups) {
    console.log(
      `${b.name}\t${b.mode}\t${b.bytes}\t${new Date(b.mtimeMs).toISOString()}`,
    );
  }
  return 0;
}

function invokedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  runRestoreCli(process.argv.slice(2))
    .then((code) => {
      if (code !== 0) process.exit(code);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
