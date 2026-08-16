import { DesignAssetsLab } from "@/components/DesignAssetsLab";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design",
  description:
    "Helix Library design lab — nav icons, helix spinner, brand mark, tokens, and UI chrome.",
};

export default function DesignPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Internal lab</p>
        <h1 className="page-title mt-1">Design assets</h1>
        <p className="page-sub max-w-2xl">
          Single surface for reviewing Helix glyphs, motion, and chrome. Use
          this while raising icon quality — large preview first, then sidebar
          scale. Theme toggle (header) for light/dark.
        </p>
      </div>
      <DesignAssetsLab />
    </div>
  );
}
