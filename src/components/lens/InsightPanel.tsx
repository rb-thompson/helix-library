"use client";

import { useCallback, useState } from "react";
import { Lightbulb, Trash2 } from "lucide-react";
import type { Insight } from "@/lib/lens/insights";

function formatWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(ms);
  }
}

/**
 * Create + list durable Deep Lens insights for a focus holding.
 */
export function InsightPanel({
  itemId,
  initialInsights,
}: {
  itemId: number;
  initialInsights: Insight[];
}) {
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [quote, setQuote] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    const q = quote.trim();
    if (!q) {
      setError("Quote or highlight text is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          quoteText: q,
          body: body.trim() || null,
          source: "manual",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        insight?: Insight;
      };
      if (!res.ok || !data.ok || !data.insight) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setInsights((prev) => [data.insight!, ...prev]);
      setQuote("");
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [itemId, quote, body]);

  const remove = useCallback(async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section className="space-y-4" aria-label="Your insights">
      <div className="flex items-center gap-2">
        <Lightbulb
          className="h-4 w-4 shrink-0 text-[var(--accent)]"
          aria-hidden
        />
        <h2 className="label-quiet !mb-0">Your insights</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Durable notes and quotes you save for this holding — separate from
        machine dossier analysis. They reappear whenever you reopen Deep Lens.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="label-quiet">Quote / highlight</span>
          <textarea
            className="mt-1 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-faint)] focus:border-[var(--accent-ring)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            rows={2}
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Paste or type a passage worth keeping…"
            disabled={busy}
          />
        </label>
        <label className="block">
          <span className="label-quiet">Note (optional)</span>
          <textarea
            className="mt-1 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--muted-faint)] focus:border-[var(--accent-ring)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Why it matters, questions, links to other work…"
            disabled={busy}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void save()}
            disabled={busy || !quote.trim()}
          >
            {busy ? "Saving…" : "Save insight"}
          </button>
          {error ? (
            <p className="text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {insights.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--muted)]">
          No insights yet for this holding.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
          {insights.map((ins) => (
            <li key={ins.id} className="px-3 py-3">
              <blockquote className="border-l-2 border-[var(--accent)] pl-3 text-sm text-[var(--ink)]">
                {ins.quoteText}
              </blockquote>
              {ins.body ? (
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{ins.body}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.7rem] text-[var(--muted)]">
                  {formatWhen(ins.createdAt)}
                  {ins.source ? ` · ${ins.source}` : ""}
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--danger)]"
                  onClick={() => void remove(ins.id)}
                  disabled={busy}
                  title="Delete insight"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
