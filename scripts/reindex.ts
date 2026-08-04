import { runReindex } from "../src/lib/indexer/run";

async function main() {
  console.log("Helix Library reindex starting…");
  const { jobId, stats } = await runReindex();
  console.log(`Job #${jobId} completed`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
