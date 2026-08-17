"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { HelixMark } from "@/components/HelixMark";
import { HelixGlyph } from "@/components/icons/HelixGlyph";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { NavIcon } from "@/components/icons/nav";
import { KindBadge } from "@/components/KindBadge";
import { InlineStatus, toast } from "@/components/ui/Feedback";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusLine } from "@/components/ui/StatusLine";
import { Surface } from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import {
  MAIN_NAV,
  NAV_ICON_NAMES,
  type NavIconName,
} from "@/lib/nav";
import type { ItemKind } from "@/lib/types";

const SECTIONS = [
  { id: "nav-icons", label: "Nav icons" },
  { id: "spinner", label: "Helix spinner" },
  { id: "brand", label: "Brand mark" },
  { id: "stills", label: "Brand stills" },
  { id: "color", label: "Color tokens" },
  { id: "type", label: "Typography" },
  { id: "motion", label: "Motion" },
  { id: "controls", label: "Controls" },
  { id: "kinds", label: "Kind badges" },
  { id: "surfaces", label: "Surfaces" },
  { id: "status", label: "Status" },
  { id: "progress", label: "Progress" },
  { id: "exceptions", label: "Exceptions" },
] as const;

const ICON_NOTES: Record<NavIconName, string> = {
  catalog: "Lucide Search — home Catalog tile",
  graph: "Lucide Network — home Graph tile",
  collections: "Lucide Layers — home Collections tile",
  ask: "Lucide MessageCircle — home Ask tile",
  lens: "Lucide Aperture — home Deep Lens tile",
  locations: "Lucide FolderOpen — home Locations tile",
  acquire: "Lucide Download — home Acquire tile",
  services: "Lucide HardDrive — home Services tile",
  docs: "Lucide BookOpen — home Docs tile",
  design: "Lucide LayoutGrid — design lab only",
};

const COLOR_TOKENS: { name: string; varName: string; group: string }[] = [
  { name: "ink", varName: "--ink", group: "Text" },
  { name: "ink-soft", varName: "--ink-soft", group: "Text" },
  { name: "muted", varName: "--muted", group: "Text" },
  { name: "muted-faint", varName: "--muted-faint", group: "Text" },
  { name: "paper", varName: "--paper", group: "Surface" },
  { name: "paper-deep", varName: "--paper-deep", group: "Surface" },
  { name: "surface", varName: "--surface", group: "Surface" },
  { name: "surface-raised", varName: "--surface-raised", group: "Surface" },
  { name: "surface-hover", varName: "--surface-hover", group: "Surface" },
  { name: "surface-overlay", varName: "--surface-overlay", group: "Surface" },
  { name: "line", varName: "--line", group: "Line" },
  { name: "line-strong", varName: "--line-strong", group: "Line" },
  { name: "accent", varName: "--accent", group: "Accent" },
  { name: "accent-hover", varName: "--accent-hover", group: "Accent" },
  { name: "accent-fg", varName: "--accent-fg", group: "Accent" },
  { name: "accent-soft", varName: "--accent-soft", group: "Accent" },
  { name: "accent-muted", varName: "--accent-muted", group: "Accent" },
  { name: "accent-ring", varName: "--accent-ring", group: "Accent" },
  { name: "accent-glow", varName: "--accent-glow", group: "Accent" },
  { name: "lamp", varName: "--lamp", group: "Circulation" },
  { name: "lamp-soft", varName: "--lamp-soft", group: "Circulation" },
  { name: "ok", varName: "--ok", group: "Status" },
  { name: "ok-soft", varName: "--ok-soft", group: "Status" },
  { name: "warn", varName: "--warn", group: "Status" },
  { name: "warn-soft", varName: "--warn-soft", group: "Status" },
  { name: "danger", varName: "--danger", group: "Status" },
  { name: "danger-soft", varName: "--danger-soft", group: "Status" },
];

const COLOR_GROUPS = [
  "Text",
  "Surface",
  "Line",
  "Accent",
  "Circulation",
  "Status",
] as const;

const MOTION_TOKENS = [
  { name: "micro", varName: "--dur-micro", intent: "Press, checkbox, icon swap" },
  { name: "ui", varName: "--dur", intent: "Hover, chip, toast in, pending" },
  { name: "scene", varName: "--dur-scene", intent: "Lightbox, reading-room expand" },
] as const;

const KINDS: ItemKind[] = [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "code",
  "archive",
  "other",
];

type IconStage = "deep" | "surface" | "raised" | "ink";
type IconPx = 16 | 20 | 24 | 32 | 48 | 64;

export function DesignAssetsLab() {
  const [iconPx, setIconPx] = useState<IconPx>(32);
  const [stage, setStage] = useState<IconStage>("deep");
  const [forceHover, setForceHover] = useState(false);
  const [selected, setSelected] = useState<NavIconName>("catalog");

  const stageClass = useMemo(() => {
    switch (stage) {
      case "surface":
        return "design-lab-icon-stage design-lab-icon-stage--surface";
      case "raised":
        return "design-lab-icon-stage design-lab-icon-stage--raised";
      case "ink":
        return "design-lab-icon-stage design-lab-icon-stage--ink";
      default:
        return "design-lab-icon-stage";
    }
  }, [stage]);

  return (
    <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <aside className="design-lab-toc lg:sticky lg:top-20 lg:self-start">
        <p className="label-quiet mb-2">On this page</p>
        <nav className="flex flex-row flex-wrap gap-x-3 gap-y-1.5 lg:flex-col lg:gap-1.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>
        <p className="mt-4 text-[0.7rem] leading-relaxed text-[var(--muted-faint)]">
          Living spec — every token and primitive lands here in the same PR.
          Theme toggle flips dark / day reading room.
        </p>
      </aside>

      <div className="min-w-0 space-y-10 sm:space-y-12">
        {/* ── Nav icons ── */}
        <section id="nav-icons" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Glyphs</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Nav icons</h2>
            <p className="page-sub mt-1 max-w-2xl">
              Same Lucide set as the home service tiles (Search, Network, Layers,
              …). Shared so nav and home stay visually consistent. Size ladder
              below for chrome vs large review.
            </p>
          </header>

          <Surface className="p-3 sm:p-4">
            <div className="flex flex-wrap items-end gap-3 sm:gap-4">
              <label className="text-xs text-[var(--muted)]">
                Size
                <select
                  className="input mt-1 block min-w-[5.5rem]"
                  value={iconPx}
                  onChange={(e) => setIconPx(Number(e.target.value) as IconPx)}
                >
                  {([16, 20, 24, 32, 48, 64] as IconPx[]).map((n) => (
                    <option key={n} value={n}>
                      {n}px
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--muted)]">
                Stage
                <select
                  className="input mt-1 block min-w-[7rem]"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as IconStage)}
                >
                  <option value="deep">paper-deep</option>
                  <option value="surface">surface</option>
                  <option value="raised">raised</option>
                  <option value="ink">on ink</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-[var(--ink-soft)]">
                <input
                  type="checkbox"
                  checked={forceHover}
                  onChange={(e) => setForceHover(e.target.checked)}
                  className="rounded border-[var(--line-strong)]"
                />
                Force hover motion
              </label>
            </div>
          </Surface>

          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
              forceHover && "design-force-hover",
            )}
          >
            {NAV_ICON_NAMES.map((name) => {
              const nav = MAIN_NAV.find((n) => n.icon === name);
              const active = selected === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelected(name)}
                  className={cn(
                    "surface text-left transition",
                    active && "ring-2 ring-[var(--accent-ring)]",
                  )}
                >
                  <div className={cn(stageClass, "rounded-b-none border-0 border-b")}>
                    <NavIcon
                      name={name}
                      className="!opacity-100"
                      style={
                        {
                          width: iconPx,
                          height: iconPx,
                        } as CSSProperties
                      }
                    />
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {nav?.label ?? name}
                      </p>
                      <code className="code-inline text-[0.65rem]">{name}</code>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      {ICON_NOTES[name]}
                    </p>
                    {nav ? (
                      <p className="text-[0.65rem] text-[var(--muted-faint)]">
                        {nav.href}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <Surface className="p-4 sm:p-5">
            <p className="label-quiet mb-3">In chrome context</p>
            <div className="flex flex-wrap gap-2">
              {MAIN_NAV.map((item) => (
                <span
                  key={item.href}
                  className={cn(
                    "nav-link",
                    item.icon === selected && "is-active",
                    forceHover && "design-force-hover",
                  )}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Selected detail:{" "}
              <strong className="text-[var(--ink)]">{selected}</strong> —{" "}
              {ICON_NOTES[selected]}. Hover a real nav link in the header to
              compare motion at product size.
            </p>
          </Surface>

          <Surface className="p-4 sm:p-5">
            <p className="label-quiet mb-3">Size ladder · {selected}</p>
            <div className="flex flex-wrap items-end gap-6">
              {([16, 20, 24, 32, 48, 64] as IconPx[]).map((n) => (
                <div key={n} className="flex flex-col items-center gap-2">
                  <div
                    className={cn(stageClass, "h-20 w-20")}
                    style={{ minHeight: 0 }}
                  >
                    <NavIcon
                      name={selected}
                      className="!opacity-100"
                      style={{ width: n, height: n } as CSSProperties}
                    />
                  </div>
                  <span className="text-[0.65rem] tabular-nums text-[var(--muted)]">
                    {n}
                  </span>
                </div>
              ))}
            </div>
          </Surface>
        </section>

        {/* ── Spinner ── */}
        <section id="spinner" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Motion</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">
              Helix spinner
            </h2>
            <p className="page-sub mt-1 max-w-2xl">
              Double-helix loader for busy states. Prefer decorative mode inside
              buttons that already announce status.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["sm", 14],
                ["md", 18],
                ["lg", 28],
                ["xl", 40],
              ] as const
            ).map(([size, px]) => (
              <Surface key={size} className="flex flex-col items-center gap-3 p-5">
                <HelixSpinner size={size} decorative />
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--ink)]">
                    size=&quot;{size}&quot;
                  </p>
                  <p className="text-xs text-[var(--muted)]">{px}px default</p>
                </div>
              </Surface>
            ))}
          </div>

          <Surface className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <button type="button" className="btn btn-primary" disabled>
              <HelixSpinner size="md" decorative />
              Reindexing…
            </button>
            <button type="button" className="btn btn-secondary" disabled>
              <HelixSpinner size="sm" decorative />
              Fetching
            </button>
            <button type="button" className="btn btn-ghost" disabled>
              <HelixSpinner size="sm" decorative />
              Working
            </button>
            <span className="chip chip-stat">
              <HelixSpinner size="sm" decorative className="text-[var(--ok)]" />
              <span className="chip-label">Job</span>
              <span className="chip-value">running</span>
            </span>
          </Surface>
        </section>

        {/* ── Brand ── */}
        <section id="brand" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Identity</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Brand mark</h2>
            <p className="page-sub mt-1 max-w-2xl">
              Raster H+helix monogram (theme-swapped). Not the same as nav glyphs
              or the spinner.
            </p>
          </header>
          <div className="flex flex-wrap items-end gap-6">
            {[36, 48, 64, 80].map((n) => (
              <div key={n} className="flex flex-col items-center gap-2">
                <span
                  className="helix-mark-well rounded-[0.65rem] border"
                  style={{ width: n, height: n }}
                >
                  <HelixMark />
                </span>
                <span className="text-[0.65rem] text-[var(--muted)]">{n}px</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Brand stills ── */}
        <section id="stills" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Circulation wave</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Brand stills</h2>
            <p className="page-sub mt-1 max-w-2xl">
              Night stacks / day reading room heroes, card lattice, folio
              banner, and a nameplate study. Heroes and lattices swap with
              theme. Lamp stays circulation-only.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <BrandStill
              src="/hero-helix.jpg"
              label="Hero · night stacks"
              note="Home, dark theme"
            />
            <BrandStill
              src="/hero-helix-light.jpg"
              label="Hero · day reading room"
              note="Home, light theme"
            />
            <BrandStill
              src="/brand/card-lattice.jpg"
              label="Card lattice"
              note="Service tiles, dark"
            />
            <BrandStill
              src="/brand/card-lattice-light.jpg"
              label="Card paper"
              note="Service tiles, light"
            />
            <BrandStill
              src="/brand/docs-folio.jpg"
              label="Folio banner"
              note="/docs handbook header"
            />
            <BrandStill
              src="/brand/plate-helix.jpg"
              label="Nameplate study"
              note="Engraved helix plate"
            />
            <BrandStill
              src="/brand/moth-idle.jpg"
              label="Night moth · idle"
              note="Circulation clerk at the cart"
            />
            <BrandStill
              src="/brand/moth-reading.jpg"
              label="Night moth · reading"
              note="Handbook hero / Hours"
            />
            <BrandStill
              src="/brand/moth-reindex.jpg"
              label="Night moth · reindex"
              note="Cards in the air"
            />
            <BrandStill
              src="/brand/moth-portrait.jpg"
              label="Night moth · portrait"
              note="Due-slip badge"
            />
          </div>
          <Surface className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <button type="button" className="btn btn-helix">
              <HelixGlyph />
              Open catalog
            </button>
            <button type="button" className="btn btn-helix btn-sm">
              <HelixGlyph />
              Reindex
            </button>
            <button type="button" className="btn btn-lamp">
              Left on the cart
            </button>
            <button type="button" className="btn btn-primary">
              Primary
            </button>
            <button type="button" className="btn btn-secondary">
              Secondary
            </button>
          </Surface>
        </section>

        {/* ── Color ── */}
        <section id="color" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Tokens</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Color</h2>
            <p className="page-sub mt-1 max-w-2xl">
              CSS variables from{" "}
              <code className="code-inline">globals.css</code>. Swatches follow
              the active theme. Starlight is chrome. Lamp is circulation only
              (due-slip, dawn, reading-room ring,{" "}
              <code className="code-inline">btn-lamp</code>) — not sidebar or
              primary chrome.
            </p>
          </header>
          {COLOR_GROUPS.map((group) => (
            <div key={group}>
              <p className="label-quiet mb-2">{group}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {COLOR_TOKENS.filter((t) => t.group === group).map((t) => (
                  <div key={t.varName} className="design-lab-swatch">
                    <div
                      className="design-lab-swatch-chip"
                      style={{ background: `var(${t.varName})` }}
                    />
                    <div className="space-y-0.5 p-2">
                      <p className="text-xs font-medium text-[var(--ink)]">
                        {t.name}
                      </p>
                      <code className="block text-[0.6rem] text-[var(--muted)]">
                        {t.varName}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ── Type ── */}
        <section id="type" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Type</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Typography</h2>
          </header>
          <Surface className="space-y-6 p-4 sm:p-5">
            <div>
              <p className="eyebrow">Eyebrow</p>
              <h1 className="page-title mt-1">Page title · desk</h1>
              <p className="page-sub mt-1 max-w-xl">
                Page sub — supporting line under titles. Uses muted ink and
                constrained measure.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="label-quiet">Desk</p>
                <p className="type-desk">Ask the Librarian</p>
              </div>
              <div>
                <p className="label-quiet">Catalog</p>
                <p className="type-catalog">Catalog</p>
              </div>
              <div>
                <p className="label-quiet">Room</p>
                <p className="type-room">Holding title</p>
              </div>
            </div>
            <PageHeader
              register="desk"
              eyebrow="PageHeader"
              title="Unused on pages this PR"
              description="register prop: desk (default) · catalog · room. Catalog / Item / Graph migrate later."
            />
            <p className="text-sm text-[var(--ink)]">
              Body soft —{" "}
              <span className="text-[var(--ink-soft)]">ink-soft</span> ·{" "}
              <span className="text-[var(--muted)]">muted</span> ·{" "}
              <span className="text-[var(--muted-faint)]">muted-faint</span>
            </p>
            <p className="text-sm">
              Inline code: <code className="code-inline">library.config.json</code>
            </p>
            <p className="label-quiet">Label quiet · uppercase micro label</p>
            <p>
              <Link href="/docs" className="link-accent">
                Accent link
              </Link>
            </p>
          </Surface>
        </section>

        {/* ── Motion ── */}
        <section id="motion" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Feel</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Motion</h2>
            <p className="page-sub mt-1 max-w-2xl">
              One easing family. Three durations. Nuclear{" "}
              <code className="code-inline">prefers-reduced-motion</code> stays.
              Helix mark does not move.
            </p>
          </header>
          <Surface className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {MOTION_TOKENS.map((t) => (
                <div key={t.varName} className="space-y-2">
                  <p className="text-sm font-medium text-[var(--ink)]">{t.name}</p>
                  <code className="block text-[0.65rem] text-[var(--muted)]">
                    {t.varName}
                  </code>
                  <p className="text-xs text-[var(--muted)]">{t.intent}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-deep)]">
                    <div
                      className="design-lab-motion-bar h-full w-1/3 rounded-full bg-[var(--accent)]"
                      style={{ animationDuration: `var(${t.varName})` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--muted)]">
              Ease: <code className="code-inline">--ease</code> keep ·{" "}
              <code className="code-inline">--ease-out</code> exits.
            </p>
          </Surface>
        </section>

        {/* ── Controls ── */}
        <section id="controls" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">UI</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Controls</h2>
          </header>
          <Surface className="space-y-5 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary">
                Primary
              </button>
              <button type="button" className="btn btn-secondary">
                Secondary
              </button>
              <button type="button" className="btn btn-ghost">
                Ghost
              </button>
              <button type="button" className="btn btn-danger">
                Danger
              </button>
              <button type="button" className="btn btn-primary btn-sm">
                Small
              </button>
              <button type="button" className="btn btn-secondary" disabled>
                Disabled
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="chip">Chip</span>
              <span className="chip chip-active">Active chip</span>
              <span className="chip chip-stat">
                <span className="chip-label">Stat</span>
                <span className="chip-value">42</span>
              </span>
            </div>
            <div className="segment w-fit" role="group" aria-label="Segment demo">
              <button type="button" className="is-active">
                2D
              </button>
              <button type="button">3D</button>
            </div>
            <div className="max-w-md space-y-2">
              <input className="input w-full" placeholder="Input field" />
              <select className="input w-full" defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                <option>Archive</option>
                <option>Vault</option>
              </select>
            </div>
          </Surface>
        </section>

        {/* ── Kinds ── */}
        <section id="kinds" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Catalog</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Kind badges</h2>
            <p className="page-sub mt-1 max-w-2xl">
              Kind is holding identity, not chrome. Foreground + background
              tokens follow the active theme.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k) => (
              <div key={k} className="design-lab-swatch">
                <div
                  className="design-lab-swatch-chip"
                  style={{ background: `var(--kind-${k}-bg)` }}
                />
                <div className="flex items-center justify-between gap-2 p-2">
                  <p
                    className="text-xs font-medium"
                    style={{ color: `var(--kind-${k})` }}
                  >
                    {k}
                  </p>
                  <code className="text-[0.55rem] text-[var(--muted)]">
                    --kind-{k}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Surfaces ── */}
        <section id="surfaces" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Chrome</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Surfaces</h2>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Surface className="p-4">
              <p className="text-sm font-medium">Raised (default)</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Cards, desks, toolstrips — <code>--surface-raised</code>
              </p>
            </Surface>
            <Surface variant="flat" className="p-4">
              <p className="text-sm font-medium">Flat</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Recessed lists — <code>--surface</code>
              </p>
            </Surface>
            <Surface variant="inset" className="p-4">
              <p className="text-sm font-medium">Inset</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Wells — <code>--paper-deep</code>
              </p>
            </Surface>
            <Surface variant="overlay" className="p-4">
              <p className="text-sm font-medium">Overlay</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Toast / callout mix + blur 14px
              </p>
            </Surface>
          </div>
        </section>

        {/* ── Status ── */}
        <section id="status" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Feedback</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Status lines</h2>
            <p className="page-sub mt-1 max-w-2xl">
              <code className="code-inline">InlineStatus</code> wraps the existing
              feedback classes. Classes stay. Toast only for off-screen jobs.
            </p>
          </header>
          <div className="space-y-2">
            <StatusLine tone="muted">Muted status</StatusLine>
            <StatusLine tone="info" pulse>
              Info with pulse (job running)
            </StatusLine>
            <StatusLine tone="ok">OK — completed cleanly</StatusLine>
            <StatusLine tone="warn">Warn — needs attention</StatusLine>
            <StatusLine tone="danger">Danger — failed</StatusLine>
            <p className="feedback-ok">Feedback OK paragraph</p>
            <p className="feedback-err">Feedback error paragraph</p>
            <InlineStatus tone="ok">InlineStatus ok — tag saved</InlineStatus>
            <InlineStatus tone="warn">InlineStatus warn — already on shelf</InlineStatus>
            <InlineStatus tone="info">InlineStatus info — shelving…</InlineStatus>
            <InlineStatus tone="danger">InlineStatus danger — request failed</InlineStatus>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                toast({
                  tone: "ok",
                  title: "Demo toast",
                  detail: "Off-screen job completion. No filesystem paths.",
                  href: "/catalog",
                })
              }
            >
              Push demo toast
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                toast({
                  tone: "danger",
                  title: "Sticky danger",
                  detail: "Dismiss by hand — danger does not auto-hide.",
                })
              }
            >
              Push sticky danger
            </button>
          </div>
        </section>

        <section id="progress" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Jobs</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">Progress</h2>
            <p className="page-sub mt-1 max-w-2xl">
              Shared bar. Default copies Acquire’s 6px track. Compact is 4px for
              the header. In production on Acquire, Backup, Jobs, Reindex, and
              Restore.
            </p>
          </header>
          <div className="grid gap-4 lg:grid-cols-2">
            <ProgressBar
              percent={42}
              active
              label="fetching"
              detail="OpenAlex OA PDF"
            />
            <ProgressBar percent={null} active label="walking locations" />
            <Surface className="space-y-2 p-4">
              <p className="text-xs font-medium text-[var(--muted)]">
                Compact (header)
              </p>
              <ProgressBar percent={70} active size="compact" label="backup" />
              <ProgressBar percent={null} active size="compact" label="reindex" />
            </Surface>
          </div>
        </section>

        <section id="exceptions" className="scroll-mt-24 space-y-4">
          <header>
            <p className="eyebrow">Season</p>
            <h2 className="page-title mt-1 text-xl sm:text-2xl">
              Exceptions & primitives
            </h2>
            <p className="page-sub mt-1 max-w-2xl">
              Deep Lens is a deliberate exception — do not flatten it to the
              slab. Restore’s typed{" "}
              <code className="code-inline">RESTORE</code> stays ugly on
              purpose.
            </p>
          </header>
          <Surface className="space-y-3 p-4 sm:p-5">
            <p className="text-sm font-medium text-[var(--ink)]">
              Deep Lens
            </p>
            <p className="text-sm text-[var(--muted)]">
              Terminal, scanlines, kind-object, drop-cap. Keep that register.
              Do not migrate{" "}
              <code className="code-inline">/lens</code> to{" "}
              <code className="code-inline">PageHeader</code> or{" "}
              <code className="code-inline">surface-flat</code> chrome.
            </p>
            <p className="text-sm font-medium text-[var(--ink)]">
              Shipped this season
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              <li>Tokens, lamp, overlay, motion, type registers</li>
              <li>
                <code className="code-inline">toast</code> /{" "}
                <code className="code-inline">InlineStatus</code> /{" "}
                <code className="code-inline">ProgressBar</code>
              </li>
              <li>
                Catalog <code className="code-inline">catalogHref</code> +
                pending paint
              </li>
              <li>Holding folios + optimistic tags / dismiss</li>
              <li>Ask bubbles, Hours lamp, shared job bars</li>
            </ul>
          </Surface>
        </section>
      </div>
    </div>
  );
}

function BrandStill({
  src,
  label,
  note,
}: {
  src: string;
  label: string;
  note: string;
}) {
  return (
    <figure className="surface overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="aspect-video w-full object-cover object-center"
      />
      <figcaption className="space-y-0.5 p-3">
        <p className="text-sm font-semibold text-[var(--ink)]">{label}</p>
        <p className="text-xs text-[var(--muted)]">{note}</p>
      </figcaption>
    </figure>
  );
}
