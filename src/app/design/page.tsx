import { DesignAssetsLab } from "@/components/DesignAssetsLab";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design",
  description:
    "Helix Library design lab — tokens, lamp, overlay, motion, type registers, and chrome.",
};

export default function DesignPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Internal lab</p>
        <h1 className="page-title mt-1">Design assets</h1>
        <p className="page-sub max-w-2xl">
          Living spec for Helix craft. Custom nav glyphs, brand stills, lamp
          (circulation only), type registers, and motion. Theme toggle in the
          header for dark / day reading room.
        </p>
      </div>
      <DesignAssetsLab />
    </div>
  );
}
