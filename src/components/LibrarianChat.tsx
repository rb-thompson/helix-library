"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AssistantMarkdown } from "@/components/AssistantMarkdown";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/lib/cn";

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
        case "collect_by_name":
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

type ActionHit =
  | { kind: "json"; payload: string }
  | { kind: "legacy"; payload: string };

function extractActions(text: string): {
  markdown: string;
  actions: ActionHit[];
} {
  const actions: ActionHit[] = [];
  let markdown = text;

  markdown = markdown.replace(/\[\[action:(\{[\s\S]*?\})\]\]/g, (_, json: string) => {
    actions.push({ kind: "json", payload: json });
    return "\n";
  });
  markdown = markdown.replace(/\[\[propose:([^\]]+)\]\]/g, (_, legacy: string) => {
    actions.push({ kind: "legacy", payload: legacy });
    return "\n";
  });

  // Collapse leftover blank lines from stripped tokens
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
  return { markdown, actions };
}

function renderAssistantText(
  text: string,
  onAction?: (kind: "legacy" | "json", payload: string) => void,
  proposeBusy?: string | null,
  onApproveAll?: () => void,
): React.ReactNode {
  const { markdown, actions } = extractActions(text);

  return (
    <div className="space-y-2">
      {markdown ? <AssistantMarkdown text={markdown} /> : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {actions.map((a, i) => {
            const busy = proposeBusy === a.payload;
            return (
              <button
                key={`${a.kind}-${i}-${a.payload.slice(0, 24)}`}
                type="button"
                disabled={busy || !onAction}
                onClick={() => onAction?.(a.kind, a.payload)}
                className="btn btn-primary btn-sm"
              >
                {busy ? "Working…" : actionButtonLabel(a.payload)}
              </button>
            );
          })}
          {actions.length > 1 && onApproveAll ? (
            <button
              type="button"
              disabled={Boolean(proposeBusy)}
              onClick={onApproveAll}
              className="btn btn-secondary btn-sm"
            >
              {proposeBusy === "__all__"
                ? "Working…"
                : `Approve all (${actions.length})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
  const [threadsOpen, setThreadsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    // Scroll inside the message pane only (not the whole page).
    const pane = messagesRef.current;
    if (pane) {
      pane.scrollTop = pane.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, status]);

  function resizeComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
  }

  useEffect(() => {
    resizeComposer();
  }, [input]);

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
      setThreadsOpen(false);
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
    setThreadsOpen(false);
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

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
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

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSubmit();
    }
  }

  const threadList = (
    <>
      <Tooltip
        className="mb-2 w-full sm:mb-3"
        content="Start a fresh conversation. Previous chats stay in the list."
      >
        <button
          type="button"
          onClick={newChat}
          className="btn btn-primary min-h-11 w-full"
        >
          New chat
        </button>
      </Tooltip>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
        {threads.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-[var(--muted)]">
            No conversations yet
          </li>
        ) : (
          threads.map((t) => (
            <li
              key={t.id}
              className="group flex w-full shrink-0 items-stretch gap-1"
            >
              <button
                type="button"
                onClick={() => void loadThread(t.id)}
                className={cn(
                  "min-h-11 min-w-0 flex-1 rounded-md px-2.5 py-2 text-left text-xs",
                  threadId === t.id
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--ink)]"
                    : "bg-[var(--paper-deep)] text-[var(--ink-soft)] hover:bg-[var(--surface-hover)]",
                )}
              >
                <span className="line-clamp-2">{t.title}</span>
              </button>
              <button
                type="button"
                onClick={() => void removeThread(t.id)}
                className="min-h-11 rounded p-2 text-[var(--muted-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] lg:opacity-0 lg:group-hover:opacity-100"
                aria-label="Delete conversation"
                title="Delete this conversation history"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>
    </>
  );

  return (
    <div className="chat-shell">
      <aside className="surface hidden min-h-0 flex-col p-3 lg:flex">
        {threadList}
      </aside>

      {threadsOpen ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-[rgb(0_0_0_/_0.45)] lg:hidden"
          role="dialog"
          aria-modal
          aria-label="Conversations"
        >
          <button
            type="button"
            className="min-h-[20%] flex-1 cursor-default"
            aria-label="Close chats"
            onClick={() => setThreadsOpen(false)}
          />
          <div className="surface flex max-h-[75dvh] flex-col rounded-t-[var(--radius)] border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--ink)]">Chats</p>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setThreadsOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {threadList}
          </div>
        </div>
      ) : null}

      <div className="chat-panel surface">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2.5 sm:px-4 sm:py-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm lg:hidden"
            onClick={() => setThreadsOpen(true)}
            aria-expanded={threadsOpen}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            Chats
            {threads.length > 0 ? (
              <span className="tabular-nums text-[var(--muted)]">
                {threads.length}
              </span>
            ) : null}
          </button>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Sparkles
              className="hidden h-4 w-4 shrink-0 text-[var(--accent)] sm:block"
              aria-hidden
            />
            <span className="truncate">Librarian</span>
            <span className="chip !py-0.5 text-[0.65rem]">confirm to act</span>
            <span
              className={cn(
                "chip !py-0.5 text-[0.65rem]",
                agent.mode === "local" && "chip-active",
              )}
            >
              {agent.label}
            </span>
          </div>
          <button
            type="button"
            onClick={newChat}
            className="btn btn-ghost btn-sm lg:hidden"
          >
            New
          </button>
        </div>

        <div
          ref={messagesRef}
          className="chat-messages space-y-3 px-3 py-3 sm:px-4 sm:py-4"
        >
          {messages.length === 0 ? (
            <div className="empty-state !py-6 sm:!py-8">
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
                  className={
                    m.role === "user"
                      ? "ml-auto max-w-[min(92%,28rem)] whitespace-pre-wrap break-words rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--accent-fg)] sm:max-w-[min(85%,32rem)]"
                      : "max-w-[min(100%,36rem)] break-words rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-[var(--shadow-soft)] sm:max-w-[min(92%,40rem)] xl:max-w-3xl"
                  }
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
          onSubmit={(e) => void onSubmit(e)}
          className="chat-composer flex items-end gap-2 border-t border-[var(--line)] p-2 sm:p-3"
        >
          <label htmlFor="librarian-input" className="sr-only">
            Message
          </label>
          <textarea
            id="librarian-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onComposerKeyDown}
            disabled={busy}
            placeholder="Ask the Librarian…"
            enterKeyHint="send"
            className="field min-w-0 flex-1 disabled:opacity-60"
          />
          <Tooltip content="Send (Enter). Shift+Enter for newline. Paths only from catalog tools.">
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="btn btn-primary min-h-11 shrink-0 px-3 sm:px-4"
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
