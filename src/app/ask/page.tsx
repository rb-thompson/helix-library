import { AskChatClient } from "@/components/AskChatClient";
import {
  agentModeDescription,
  agentModeLabel,
  hasXaiApiKey,
  resolveAgentMode,
} from "@/lib/agent/mode";
import { listThreads } from "@/lib/agent/threads";
import { displayTitle } from "@/lib/catalog/display";
import { getItemById } from "@/lib/catalog/query";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ask the Librarian",
};

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; quote?: string }>;
}) {
  const sp = await searchParams;
  const threads = listThreads().map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt,
  }));
  const mode = resolveAgentMode();
  const hasKey = hasXaiApiKey();

  const rawId = sp.item ? Number(sp.item) : NaN;
  const holding =
    Number.isFinite(rawId) && rawId > 0 ? getItemById(Math.floor(rawId)) : null;
  const holdingItemId = holding?.id ?? null;
  const holdingLabel = holding ? displayTitle(holding) : null;
  // Short URL quote only — full quote may live in sessionStorage (client).
  const urlQuote = (sp.quote ?? "").trim().slice(0, 500) || null;

  return (
    <div className="ask-page">
      <header className="shrink-0 space-y-1.5 sm:space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">Reference desk</p>
            <h1 className="page-title mt-0.5">Ask the Librarian</h1>
          </div>
          <p
            className="chip !py-1 text-[0.7rem]"
            title={agentModeDescription(mode)}
          >
            {agentModeLabel(mode)}
            {mode === "xai" ? " · approve to act" : " · offline tools"}
          </p>
        </div>
        <p className="page-sub max-w-2xl text-[0.8125rem] sm:text-sm">
          Find holdings and run in-app tasks. Paths from the catalog only —
          nothing mutates until you{" "}
          <strong className="font-medium text-[var(--ink-soft)]">approve</strong>
          .{" "}
          <span className="hidden sm:inline">
            No shell, no wiping the app.
          </span>
        </p>

        {holding ? (
          <p className="surface-flat border-[var(--accent-ring)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)]">
            Active holding:{" "}
            <a
              href={`/catalog/${holding.id}`}
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              {displayTitle(holding)}
            </a>
            <span className="text-[var(--muted)]">
              {" "}
              · id {holding.id} · catalog_read on summarize
            </span>
          </p>
        ) : null}

        {mode === "local" && !hasKey ? (
          <details className="surface-flat group border-[var(--accent-ring)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--ink)] sm:px-4 sm:py-2.5">
            <summary className="cursor-pointer list-none font-semibold tracking-tight marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                Prefer Grok for reasoning
                <span className="text-xs font-normal text-[var(--muted)] group-open:hidden">
                  — tap for setup
                </span>
                <span className="hidden text-xs font-normal text-[var(--muted)] group-open:inline">
                  — hide
                </span>
              </span>
            </summary>
            <div className="mt-2 space-y-2 border-t border-[var(--line)] pt-2 text-[0.8125rem] text-[var(--ink-soft)]">
              <p>
                SuperGrok powers chat on grok.com (and OpenClaw via OAuth). It
                does{" "}
                <strong className="font-medium text-[var(--ink)]">not</strong>{" "}
                unlock the developer API Helix Library uses for in-app Grok +
                tools.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong className="font-medium text-[var(--ink)]">
                    In-app Grok:
                  </strong>{" "}
                  key from{" "}
                  <a
                    href="https://console.x.ai"
                    className="link-accent"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.x.ai
                  </a>{" "}
                  as{" "}
                  <code className="rounded bg-[var(--surface)] px-1 text-xs">
                    XAI_API_KEY
                  </code>
                  .
                </li>
                <li>
                  <strong className="font-medium text-[var(--ink)]">
                    Right now:
                  </strong>{" "}
                  Local mode still finds holdings and proposes approved tasks.
                </li>
              </ul>
            </div>
          </details>
        ) : null}

        {mode === "xai" ? (
          <p className="text-xs text-[var(--muted)]">
            Active backend:{" "}
            <span className="font-medium text-[var(--accent)]">Grok</span>{" "}
            (developer API). Mutations still require your approve.
          </p>
        ) : null}
      </header>

      <AskChatClient
        initialThreads={threads}
        agent={{
          mode,
          label: agentModeLabel(mode),
          hasXaiApiKey: hasKey,
          note: agentModeDescription(mode),
        }}
        holdingItemId={holdingItemId}
        holdingLabel={holdingLabel}
        urlQuote={urlQuote}
      />
    </div>
  );
}
