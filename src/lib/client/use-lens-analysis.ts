"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  LensAnalysisRowView,
  LensAnalysisTopStatus,
} from "@/lib/lens/dossier";
import {
  readLensAuto,
  writeLensAuto,
  readLensAutoXaiConfirmed,
  writeLensAutoXaiConfirmed,
} from "@/lib/client/lens-object-mode";

export type LensAnalysisApi = {
  ok?: boolean;
  status?: LensAnalysisTopStatus;
  analysis?: LensAnalysisRowView | null;
  jobId?: number | null;
  agentMode?: "local" | "xai";
  error?: string;
  started?: boolean;
};

export function useLensAnalysis(opts: {
  itemId: number;
  initialStatus: LensAnalysisTopStatus;
  initialAnalysis: LensAnalysisRowView | null;
  initialJobId: number | null;
  agentMode: "local" | "xai";
}) {
  const [status, setStatus] = useState(opts.initialStatus);
  const [analysis, setAnalysis] = useState(opts.initialAnalysis);
  const [jobId, setJobId] = useState(opts.initialJobId);
  const [mode, setMode] = useState(opts.agentMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/lens/analyses?itemId=${opts.itemId}`);
      const data = (await res.json()) as LensAnalysisApi;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Load failed (${res.status})`);
      }
      setStatus(data.status ?? "missing");
      setAnalysis(data.analysis ?? null);
      setJobId(data.jobId ?? null);
      if (data.agentMode) setMode(data.agentMode);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [opts.itemId]);

  const run = useCallback(
    async (force = false) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/lens/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: opts.itemId, force }),
        });
        const data = (await res.json()) as LensAnalysisApi;
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Analyze failed (${res.status})`);
        }
        setStatus(data.status ?? "missing");
        setAnalysis(data.analysis ?? null);
        setJobId(data.jobId ?? null);
        if (data.status === "running" && data.jobId) {
          const jid = data.jobId;
          for (let i = 0; i < 90; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const st = await refresh();
            if (st && st.status !== "running") break;
            await fetch(`/api/jobs/${jid}`).catch(() => null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [opts.itemId, refresh],
  );

  useEffect(() => {
    setAuto(readLensAuto());
  }, []);

  useEffect(() => {
    if (!auto) return;
    if (status !== "missing" && status !== "stale" && status !== "failed") {
      return;
    }
    if (mode === "xai" && !readLensAutoXaiConfirmed()) return;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  function toggleAuto() {
    if (!auto && mode === "xai" && !readLensAutoXaiConfirmed()) {
      const ok = window.confirm(
        "Auto-compile will send holding metadata and indexed text to the xAI developer API when the entry is missing. Continue?",
      );
      if (!ok) return;
      writeLensAutoXaiConfirmed();
    }
    const next = !auto;
    setAuto(next);
    writeLensAuto(next);
  }

  async function applyTag(name: string) {
    setError(null);
    const res = await fetch(`/api/items/${opts.itemId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Tag apply failed");
    }
  }

  const discard = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lens/analyses?itemId=${opts.itemId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as LensAnalysisApi & { deleted?: boolean };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Discard failed (${res.status})`);
      }
      setStatus("missing");
      setAnalysis(null);
      setJobId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [opts.itemId]);

  return {
    status,
    analysis,
    jobId,
    mode,
    busy,
    error,
    auto,
    setError,
    refresh,
    run,
    toggleAuto,
    applyTag,
    discard,
  };
}
