import { LibrarianChat } from "@/components/LibrarianChat";
import {
  agentModeDescription,
  agentModeLabel,
  hasXaiApiKey,
  resolveAgentMode,
} from "@/lib/agent/mode";
import { listThreads } from "@/lib/agent/threads";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ask the Librarian",
};

export default function AskPage() {
  const threads = listThreads().map((t) => ({
    id: t.id,
    title: t.title,
    updatedAt: t.updatedAt,
  }));
  const mode = resolveAgentMode();
  const hasKey = hasXaiApiKey();

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="eyebrow">Reference desk</p>
        <h1 className="page-title mt-1">Ask the Librarian</h1>
        <p className="page-sub max-w-2xl">
          Find holdings and run in-app tasks from text: reindex, shelves, tags,
          locations. Paths come from the catalog. Nothing mutates until you{" "}
          <strong className="font-medium text-[var(--ink-soft)]">approve</strong>{" "}
          (button or reply “yes”). No shell, no wiping the app.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-[var(--muted-faint)]">
          {agentModeDescription(mode)}
        </p>
      </div>

      {mode === "local" && !hasKey ? (
        <div className="surface-flat border-[var(--accent-ring)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]">
          <p className="font-semibold tracking-tight">Grok is the preferred reasoning path</p>
          <p className="mt-1 text-[var(--ink-soft)]">
            SuperGrok powers chat on grok.com (and OpenClaw via OAuth). It does{" "}
            <strong className="font-medium">not</strong> unlock the developer
            API that Helix Library uses for in-app Grok + tools.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-soft)]">
            <li>
              <strong className="font-medium text-[var(--ink)]">In-app Grok:</strong>{" "}
              free/promo credits or paid tokens at{" "}
              <a
                href="https://console.x.ai"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                console.x.ai
              </a>
              , then set <code className="rounded bg-[var(--surface)] px-1 text-xs">XAI_API_KEY</code>{" "}
              (mode defaults to Grok when a key is present).
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">Subscription Grok:</strong>{" "}
              use{" "}
              <a
                href="https://x.ai/news/grok-openclaw"
                className="link-accent"
                target="_blank"
                rel="noreferrer"
              >
                OpenClaw + SuperGrok OAuth
              </a>{" "}
              for agent chat; keep Helix Library as the library desk (local tools still work here).
            </li>
            <li>
              <strong className="font-medium text-[var(--ink)]">Right now:</strong>{" "}
              Local mode still finds holdings and proposes approved tasks without any key.
            </li>
          </ul>
        </div>
      ) : null}

      {mode === "xai" ? (
        <p className="text-xs text-[var(--muted)]">
          Active backend: <span className="font-medium text-[var(--accent)]">Grok</span>{" "}
          (developer API). Mutations still require your approve.
        </p>
      ) : null}

      <LibrarianChat
        initialThreads={threads}
        agent={{
          mode,
          label: agentModeLabel(mode),
          hasXaiApiKey: hasKey,
          note: agentModeDescription(mode),
        }}
      />
    </div>
  );
}
