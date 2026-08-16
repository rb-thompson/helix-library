"use client";

import { useEffect, useState } from "react";
import { LibrarianChat } from "@/components/LibrarianChat";
import {
  clearAskQuote,
  readAskQuote,
  stripControlChars,
} from "@/lib/client/ask-quote";

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

/**
 * Hydrates optional helix-ask-quote from sessionStorage for Ask-about-selection.
 */
export function AskChatClient({
  initialThreads,
  agent,
  holdingItemId,
  holdingLabel,
  holdingKind,
  urlQuote,
}: {
  initialThreads: ThreadRow[];
  agent: AgentInfo;
  holdingItemId: number | null;
  holdingLabel: string | null;
  holdingKind: string | null;
  urlQuote: string | null;
}) {
  const [quote, setQuote] = useState<string | null>(urlQuote);

  useEffect(() => {
    const stored = readAskQuote();
    if (stored) {
      setQuote(stripControlChars(stored).trim().slice(0, 2000) || urlQuote);
      // One-shot: clear so a later plain /ask visit is not sticky
      clearAskQuote();
    }
  }, [urlQuote]);

  return (
    <LibrarianChat
      initialThreads={initialThreads}
      agent={agent}
      holdingItemId={holdingItemId}
      holdingLabel={holdingLabel}
      holdingKind={holdingKind}
      initialQuote={quote}
    />
  );
}
