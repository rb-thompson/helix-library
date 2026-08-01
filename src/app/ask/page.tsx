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

      <LibrarianChat
        initialThreads={threads}
        agent={{
          mode,
          label: agentModeLabel(mode),
          hasXaiApiKey: hasXaiApiKey(),
          note: agentModeDescription(mode),
        }}
      />
    </div>
  );
}
