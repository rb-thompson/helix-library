import Link from "next/link";
import { NavIcon } from "@/components/icons/nav";
import { MAIN_NAV } from "@/lib/nav";

const BLURBS: Record<string, string> = {
  "/catalog": "Search, browse, preview.",
  "/graph": "See how holdings connect.",
  "/collections": "Shelves you keep, or queries that stay live.",
  "/ask": "Ask in plain language. Writes wait for you.",
  "/lens": "Sit with one holding until it makes sense.",
  "/locations": "The folders Helix is allowed to see.",
  "/acquire": "Bring a paper, clip, or tape into the stacks.",
  "/services": "Reindex, snapshot, restore the catalog.",
  "/docs": "You are here.",
};

export function LibraryMap() {
  return (
    <div className="library-map">
      <p className="library-map-kicker">The floor plan</p>
      <ul className="library-map-grid">
        {MAIN_NAV.map((desk) => (
          <li key={desk.href}>
            <Link href={desk.href} className="library-map-desk">
              <span className="library-map-icon">
                <NavIcon name={desk.icon} className="!opacity-100" />
              </span>
              <span className="min-w-0">
                <span className="library-map-label">{desk.label}</span>
                <span className="library-map-blurb">
                  {BLURBS[desk.href] ?? desk.tip}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
