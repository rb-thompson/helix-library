"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/lib/cn";

export function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  return (
    <Tooltip content="Copy absolute path on this machine">
      <button
        type="button"
        onClick={copy}
        className={cn(
          "btn btn-sm",
          copied ? "btn-secondary text-[var(--ok)]" : "btn-secondary",
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
        {copied ? "Copied" : "Copy path"}
      </button>
    </Tooltip>
  );
}
