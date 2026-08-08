/**
 * CLI: npm run backup [-- --full] [-- --no-thumbs]
 */
import { createBackup } from "../src/lib/backup/create";

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--full") ? "full" : "catalog";
  const includeThumbs = !args.includes("--no-thumbs");

  console.log(`Creating ${mode} backup (thumbs=${includeThumbs})…`);
  const result = await createBackup({
    mode,
    includeThumbs,
    onProgress: (p) => {
      const pct = p.percent != null ? `${Math.round(p.percent)}%` : "…";
      console.log(`  [${pct}] ${p.stage}: ${p.detail ?? ""}`);
    },
  });
  console.log(`\nOK ${result.name}`);
  console.log(`   path: ${result.path}`);
  console.log(`   bytes: ${result.bytes}`);
  console.log(`   includes: ${result.manifest.includes.join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
