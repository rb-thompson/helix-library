"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { Tooltip } from "@/components/Tooltip";

type ThreadRow = {
  id: number;
  title: string;
  updatedAt: number;
};

type AgentInfo = {
  mode: "local" | "xai";
  label: string;
  hasXaiApiKey: boolean;
  note: string;
};

function messageText(m: UIMessage): string {
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function actionButtonLabel(payload: string): string {
  if (payload.startsWith("{")) {
    try {
      const a = JSON.parse(payload) as { type?: string; name?: string };
      switch (a.type) {
        case "reindex":
          return "Approve reindex";
        case "tag":
        case "bulk_tag":
          return "Approve tag";
        case "collect":
        case "bulk_collect":
          return "Approve shelf";
        case "create_collection":
          return a.name ? `Create “${a.name}”` : "Create collection";
        case "update_collection":
          return "Update collection";
        case "delete_collection":
          return "Delete collection";
        case "add_location":
          return "Add location";
        case "remove_location":
          return "Remove location";
        case "set_location_enabled":
          return "Update location";
        default:
          return "Approve";
      }
    } catch {
      return "Approve";
    }
  }
  if (payload === "reindex" || payload.startsWith("reindex"))
    return "Approve reindex";
  if (payload.startsWith("tag ")) return "Approve tag";
  if (payload.startsWith("collect ")) return "Approve shelf";
  return "Approve";
}

function renderAssistantText(
  text: string,
  onAction?: (kind: "legacy" | "json", payload: string) => void,
  proposeBusy?: string | null,
  onApproveAll?: () => void,
): React.ReactNode[] {
  // Links, bold, [[action:{json}]], legacy [[propose:...]]
  const withLinks = text.split(
    /(\/catalog\/\d+|\*\*[^*]+\*\*|\[\[action:\{[\s\S]*?\}\]\]|\[\[propose:[^\]]+\]\])/g,
  );

  const actionCount = (text.match(/\[\[action:\{/g) || []).length +
    (text.match(/\[\[propose:/g) || []).length;

  const nodes = withLinks.map((part, i) => {
    if (/^\/catalog\/\d+$/.test(part)) {
      return (
        <Link
          key={i}
          href={part}
          className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {part}
        </Link>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const actionJson = part.match(/^\[\[action:(\{[\s\S]*\})\]\]$/);
    if (actionJson) {
      const payload = actionJson[1];
      const busy = proposeBusy === payload;
      return (
        <button
          key={i}
          type="button"
          disabled={busy || !onAction}
          onClick={() => onAction?.("json", payload)}
          className="btn btn-primary btn-sm my-1"
        >
          {busy ? "Working…" : actionButtonLabel(payload)}
        </button>
      );
    }
    const propose = part.match(/^\[\[propose:([^\]]+)\]\]$/);
    if (propose) {
      const payload = propose[1];
      const busy = proposeBusy === payload;
      return (
        <button
          key={i}
          type="button"
          disabled={busy || !onAction}
          onClick={() => onAction?.("legacy", payload)}
          className="btn btn-primary btn-sm my-1"
        >
          {busy ? "Working…" : actionButtonLabel(payload)}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });

  if (actionCount > 1 && onApproveAll) {
    nodes.push(
      <div key="approve-all" className="mt-2">
        <button
          type="button"
          disabled={Boolean(proposeBusy)}
          onClick={onApproveAll}
          className="btn btn-secondary btn-sm"
        >
          {proposeBusy === "__all__" ? "Working…" : `Approve all (${actionCount})`}
        </button>
      </div>,
    );
  }

  return nodes;
}

export function LibrarianChat({
  initialThreads,
  agent,
}: {
  initialThreads: ThreadRow[];
  agent: AgentInfo;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);
  const [proposeBusy, setProposeBusy] = useState<string | null>(null);
  const [proposeNote, setProposeNote] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadIdRef = useRef<number | null>(null);
  threadIdRef.current = threadId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ask",
        body: () => ({ threadId: threadIdRef.current }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages, error, clearError } =
    useChat({
      transport,
      onFinish: async () => {
        try {
          const res = await fetch("/api/threads");
          const data = await res.json();
          if (data.threads) setThreads(data.threads);
        } catch {
          // ignore
        }
      },
    });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function loadThread(id: number) {
    setBootError(null);
    clearError();
    try {
      const res = await fetch(`/api/threads/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setBootError(data.error ?? "Failed to load thread");
        return;
      }
      setThreadId(id);
      const uiMessages: UIMessage[] = (
        data.messages as Array<{
          id: number;
          role: string;
          content: string;
        }>
      ).map((m) => ({
        id: String(m.id),
        role: m.role as "user" | "assistant" | "system",
        parts: [{ type: "text" as const, text: m.content }],
      }));
      setMessages(uiMessages);
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to load thread");
    }
  }

  function newChat() {
    setThreadId(null);
    setMessages([]);
    clearError();
    setBootError(null);
  }

  async function removeThread(id: number) {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/threads/${id}`, { method: "DELETE" });
    setThreads((t) => t.filter((x) => x.id !== id));
    if (threadId === id) newChat();
  }

  async function runAgentAction(
    kind: "legacy" | "json",
    payload: string,
  ) {
    setProposeBusy(payload);
    setProposeNote(null);
    try {
      const body =
        kind === "json"
          ? { action: JSON.parse(payload) as unknown }
          : { legacy: payload };
      const res = await fetch("/api/agent/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? data.message ?? "Action failed");
      }
      setProposeNote(data.message ?? "Done.");
    } catch (e) {
      setProposeNote(e instanceof Error ? e.message : "Action failed");
    } finally {
      setProposeBusy(null);
    }
  }

  async function approveAllFromMessage(text: string) {
    setProposeBusy("__all__");
    setProposeNote(null);
    try {
      const actions: unknown[] = [];
      const actionRe = /\[\[action:(\{[\s\S]*?\})\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = actionRe.exec(text)) !== null) {
        try {
          actions.push(JSON.parse(m[1]));
        } catch {
          // skip
        }
      }
      // legacy proposes
      const propRe = /\[\[propose:([^\]]+)\]\]/g;
      while ((m = propRe.exec(text)) !== null) {
        const res = await fetch("/api/agent/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legacy: m[1] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Action failed");
      }
      if (actions.length) {
        const res = await fetch("/api/agent/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Action failed");
        setProposeNote(data.message ?? "All actions done.");
      } else if (!text.includes("[[propose:")) {
        setProposeNote("No actions found in that message.");
      } else {
        setProposeNote("Legacy actions applied.");
      }
    } catch (e) {
      setProposeNote(e instanceof Error ? e.message : "Action failed");
    } finally {
      setProposeBusy(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    clearError();
    setProposeNote(null);

    let tid = threadId;
    if (tid == null) {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 56) }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        tid = data.id as number;
        threadIdRef.current = tid;
        setThreadId(tid);
        setThreads((prev) => [
          {
            id: tid!,
            title: text.length > 56 ? `${text.slice(0, 53)}…` : text,
            updatedAt: Date.now(),
          },
          ...prev,
        ]);
      }
    } else {
      threadIdRef.current = tid;
    }

    await sendMessage({ text });
  }

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-[240px_1fr] xl:grid-cols-[280px_1fr]">
      <aside className="surface p-3">
        <Tooltip
          className="mb-2 w-full sm:mb-3"
          content="Start a fresh conversation. Previous chats stay in the list."
        >
          <button
            type="button"
            onClick={newChat}
            className="btn btn-primary w-full"
          >
            New chat
          </button>
        </Tooltip>
        {/* Horizontal thread chips on small screens; list on lg+ */}
        <ul className="flex max-h-28 gap-1.5 overflow-x-auto pb-1 sm:max-h-36 lg:max-h-[28rem] lg:flex-col lg:space-y-1 lg:overflow-y-auto lg:pb-0">
          {threads.length === 0 ? (
            <li className="w-full px-2 py-3 text-center text-xs text-stone-500 lg:py-4">
              No conversations yet
            </li>
          ) : (
            threads.map((t) => (
              <li
                key={t.id}
                className="group flex shrink-0 items-stretch gap-1 lg:w-full lg:shrink"
              >
                <button
                  type="button"
                  onClick={() => loadThread(t.id)}
                  className={`min-w-[9rem] max-w-[12rem] flex-1 rounded-md px-2.5 py-2 text-left text-xs lg:min-w-0 lg:max-w-none ${
                    threadId === t.id
                      ? "bg-teal-50 font-medium text-teal-900"
                      : "bg-stone-50 text-stone-700 hover:bg-stone-100 lg:bg-transparent lg:hover:bg-stone-50"
                  }`}
                >
                  <span className="line-clamp-2">{t.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeThread(t.id)}
                  className="rounded p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700 lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label="Delete conversation"
                  title="Delete this conversation history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="surface flex min-h-[20rem] flex-col sm:min-h-[28rem]">
        <div className="border-b border-[var(--line)] px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            Librarian
            <span className="chip !py-0.5 text-[0.65rem]">confirm to act</span>
            <span
              className={`chip !py-0.5 text-[0.65rem] ${
                agent.mode === "local" ? "chip-active" : ""
              }`}
            >
              {agent.label}
            </span>
          </div>
          {agent.mode === "local" ? (
            <p className="mt-1 hidden text-xs text-[var(--muted)] sm:block">
              <strong className="font-medium text-[var(--ink-soft)]">No API key.</strong>{" "}
              Local catalog tools. See{" "}
              <a href="/docs#librarian" className="link-accent">
                Docs
              </a>{" "}
              for optional xAI.
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Using xAI developer API. Paths only from catalog tools.
            </p>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {messages.length === 0 ? (
            <div className="empty-state !py-8">
              <strong>Try asking</strong>
              <ul className="mt-2 space-y-1 text-[var(--muted)]">
                <li>“Where is my resume?”</li>
                <li>“Create collection Career” → approve</li>
                <li>“Tag resume as career” → approve / say yes</li>
                <li>“Reindex now” → approve</li>
              </ul>
            </div>
          ) : (
            messages.map((m) => {
              const text = messageText(m);
              if (!text && m.role === "assistant") {
                return (
                  <div
                    key={m.id}
                    className="rounded-[var(--radius-sm)] bg-[var(--paper-deep)] px-3 py-2 text-sm text-[var(--muted)]"
                  >
                    Looking in the catalog…
                  </div>
                );
              }
              if (!text) return null;
              return (
                <div
                  key={m.id}
                  className={`max-w-[90%] rounded-[var(--radius-sm)] px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "ml-auto bg-[var(--accent)] text-white"
                      : "bg-[var(--paper-deep)] text-[var(--ink)]"
                  }`}
                >
                  {m.role === "assistant"
                    ? renderAssistantText(
                        text,
                        runAgentAction,
                        proposeBusy,
                        () => void approveAllFromMessage(text),
                      )
                    : text}
                </div>
              );
            })
          )}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Librarian is working…
            </div>
          ) : null}
          {proposeNote ? (
            <p className="feedback-ok" role="status">
              {proposeNote}
            </p>
          ) : null}
          {(error || bootError) && (
            <p className="feedback-err" role="alert">
              {error?.message ?? bootError}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={onSubmit}
          className="flex gap-2 border-t border-[var(--line)] p-2 sm:p-3"
        >
          <label htmlFor="librarian-input" className="sr-only">
            Message
          </label>
          <input
            id="librarian-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask the Librarian…"
            className="field min-w-0 flex-1 disabled:opacity-60"
          />
          <Tooltip content="Send. Paths come only from catalog tools.">
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn btn-primary shrink-0"
            >
              <Send className="h-4 w-4" aria-hidden />
              <span className="sr-only sm:not-sr-only sm:inline">Send</span>
            </button>
          </Tooltip>
        </form>
      </div>
    </div>
  );
}
