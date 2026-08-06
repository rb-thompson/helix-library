import { AcquireDesk } from "@/components/AcquireDesk";
import { acquireCapabilities } from "@/lib/acquire/status";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Acquire",
  description:
    "Interlibrary-style acquisitions: arXiv PDFs, YouTube/podcast downloads, Grok images into your archive.",
};

export default function AcquirePage() {
  ensureLocationsSynced();
  const caps = acquireCapabilities();

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Acquisitions desk</p>
        <h1 className="page-title mt-1">Acquire</h1>
        <p className="page-sub max-w-2xl">
          Interlibrary loan for your personal stacks — pull remote papers,
          media, and generated images into Archive holdings, then reindex so
          they appear in the catalog.
        </p>
      </div>

      <AcquireDesk initialCaps={caps} />
    </div>
  );
}
