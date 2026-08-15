import { kindObjectSpec } from "@/lib/lens/kind-object";

/**
 * Static 2D kind metaphor (mobile / reduced-motion / WebGL failure).
 */
export function KindPoster({
  kind,
  title,
  thumbUrl,
}: {
  kind: string;
  title: string;
  thumbUrl?: string | null;
}) {
  const spec = kindObjectSpec(kind);
  const short =
    title.length > 48 ? `${title.slice(0, 47)}…` : title;

  return (
    <div
      className="relative flex aspect-square w-full max-h-[min(22rem,50vh)] flex-col items-center justify-center overflow-hidden rounded-xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,#0a0f1a)] p-4"
      role="img"
      aria-label={`${spec.label}: ${title}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 40% 30%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 60%)",
        }}
        aria-hidden
      />
      <MetaphorGlyph metaphor={spec.metaphor} thumbUrl={thumbUrl} />
      <p className="relative mt-3 max-w-[90%] truncate text-center text-sm font-semibold text-[var(--ink)]">
        {short}
      </p>
      <p className="relative mt-0.5 text-[0.7rem] uppercase tracking-wider text-[var(--muted)]">
        {spec.label}
      </p>
    </div>
  );
}

function MetaphorGlyph({
  metaphor,
  thumbUrl,
}: {
  metaphor: string;
  thumbUrl?: string | null;
}) {
  if (thumbUrl && (metaphor === "vhs" || metaphor === "photo_print")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbUrl}
        alt=""
        className="relative z-[1] h-28 w-40 rounded-md border border-[var(--line-strong)] object-cover shadow-lg sm:h-36 sm:w-52"
      />
    );
  }

  const base =
    "relative z-[1] rounded-md border border-[var(--line-strong)] shadow-lg";

  switch (metaphor) {
    case "vhs":
      return (
        <div
          className={`${base} flex h-24 w-36 flex-col justify-between bg-[#1a2438] p-2 sm:h-28 sm:w-44`}
        >
          <div className="h-10 rounded bg-[var(--accent-soft)]" />
          <div className="h-2 w-1/3 rounded bg-white/20" />
        </div>
      );
    case "cassette":
      return (
        <div
          className={`${base} flex h-20 w-32 items-center justify-center gap-3 bg-[#243044] sm:h-24 sm:w-40`}
        >
          <span className="h-8 w-8 rounded-full border-2 border-white/30" />
          <span className="h-8 w-8 rounded-full border-2 border-white/30" />
        </div>
      );
    case "paper":
      return (
        <div
          className={`${base} h-32 w-24 rotate-[-4deg] bg-[var(--paper)] p-2 sm:h-40 sm:w-28`}
        >
          <div className="space-y-1.5">
            <div className="h-1 w-full bg-[var(--line)]" />
            <div className="h-1 w-4/5 bg-[var(--line)]" />
            <div className="h-1 w-full bg-[var(--line)]" />
            <div className="h-1 w-3/5 bg-[var(--line)]" />
          </div>
        </div>
      );
    case "paper_stack":
      return (
        <div className="relative z-[1] h-36 w-28 sm:h-40 sm:w-32">
          <div
            className={`${base} absolute inset-0 translate-x-1 translate-y-1 bg-[var(--paper-deep)]`}
          />
          <div
            className={`${base} absolute inset-0 -translate-x-0.5 translate-y-0.5 bg-[var(--paper)]`}
          />
          <div
            className={`${base} absolute inset-0 bg-[var(--surface-raised)] p-2`}
          >
            <div className="h-1 w-full bg-[var(--line)]" />
            <div className="mt-1.5 h-1 w-3/4 bg-[var(--line)]" />
          </div>
        </div>
      );
    case "photo_print":
      return (
        <div
          className={`${base} flex h-32 w-28 items-center justify-center bg-[#111] p-2 sm:h-40 sm:w-32`}
        >
          <div className="h-full w-full bg-[var(--accent-soft)]" />
        </div>
      );
    case "floppy":
      return (
        <div
          className={`${base} flex h-28 w-28 flex-col bg-[#1e3a5f] p-2 sm:h-32 sm:w-32`}
        >
          <div className="mx-auto h-3 w-10 rounded-sm bg-[#0a1628]" />
          <div className="mt-auto h-10 rounded bg-[var(--paper)]" />
        </div>
      );
    default:
      return (
        <div
          className={`${base} flex h-28 w-36 items-center justify-center bg-[#2a2218] sm:h-32 sm:w-40`}
        >
          <span className="text-xs font-medium text-white/50">CRATE</span>
        </div>
      );
  }
}
