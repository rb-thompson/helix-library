"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  dismissToast,
  getToastSnapshot,
  subscribeToasts,
  toast,
  type FeedbackTone,
} from "@/lib/client/toasts";

export { toast, dismissToast };
export type { FeedbackTone };

const TONE_CLASS: Record<FeedbackTone, string> = {
  ok: "feedback-ok",
  danger: "feedback-err",
  warn: "feedback-warn",
  info: "feedback-info",
};

const TOAST_EDGE: Record<FeedbackTone, string> = {
  ok: "var(--ok)",
  danger: "var(--danger)",
  warn: "var(--warn)",
  info: "var(--accent)",
};

export function InlineStatus({
  tone,
  children,
  className,
}: {
  tone: FeedbackTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(TONE_CLASS[tone], className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function ToastRegion() {
  const items = useSyncExternalStore(
    subscribeToasts,
    getToastSnapshot,
    getToastSnapshot,
  );

  if (items.length === 0) return null;

  return (
    <div className="helix-toast-region" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div
          key={item.id}
          className="helix-toast surface-overlay"
          role={item.tone === "danger" ? "alert" : "status"}
          style={{ ["--toast-edge" as string]: TOAST_EDGE[item.tone] }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
            {item.detail ? (
              <p className="mt-0.5 text-xs text-[var(--muted)]">{item.detail}</p>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="mt-1.5 inline-block text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Open
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon shrink-0"
            aria-label="Dismiss"
            onClick={() => dismissToast(item.id)}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
