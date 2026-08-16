/**
 * In-memory toast store. No React, no window at module scope —
 * importable from Node tests (same discipline as other client prefs).
 *
 * Toasts are off-screen job confirmation only. Never put filesystem
 * paths in title/detail — callers pass catalog titles.
 */

export type FeedbackTone = "ok" | "warn" | "danger" | "info";

export type Toast = {
  id: string;
  tone: FeedbackTone;
  title: string;
  detail?: string;
  href?: string;
  timeoutMs: number; // 0 = sticky
};

export type ToastInput = Omit<Toast, "id" | "timeoutMs"> & {
  timeoutMs?: number;
};

const MAX_VISIBLE = 3;
const DEFAULT_TIMEOUT_MS = 3200;

/** Same-origin relative paths only. Drops file:/http:/POSIX paths. */
export const TOAST_HREF_RE =
  /^\/(catalog|services|acquire|collections)(\/[0-9]+)?(\?.*)?$/;

let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const cb of listeners) cb();
}

function defaultTimeoutMs(tone: FeedbackTone): number {
  return tone === "danger" ? 0 : DEFAULT_TIMEOUT_MS;
}

export function sanitizeToastHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return TOAST_HREF_RE.test(href) ? href : undefined;
}

export function subscribeToasts(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getToastSnapshot(): readonly Toast[] {
  return toasts;
}

function clearTimer(id: string): void {
  const handle = timers.get(id);
  if (!handle) return;
  clearTimeout(handle);
  timers.delete(id);
}

function pruneTimers(keep: ReadonlySet<string>): void {
  for (const id of [...timers.keys()]) {
    if (!keep.has(id)) clearTimer(id);
  }
}

function scheduleDismiss(id: string, timeoutMs: number): void {
  if (timeoutMs <= 0) return;
  const handle = setTimeout(() => {
    timers.delete(id);
    dismissToast(id);
  }, timeoutMs);
  timers.set(id, handle);
}

export function toast(input: ToastInput): string {
  const id = `t-${++seq}`;
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs(input.tone);
  const next: Toast = {
    id,
    tone: input.tone,
    title: input.title,
    timeoutMs,
  };
  if (input.detail !== undefined) next.detail = input.detail;
  const href = sanitizeToastHref(input.href);
  if (href) next.href = href;

  toasts = [next, ...toasts].slice(0, MAX_VISIBLE);
  pruneTimers(new Set(toasts.map((t) => t.id)));
  scheduleDismiss(id, timeoutMs);
  emit();
  return id;
}

export function dismissToast(id: string): void {
  clearTimer(id);
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

/** Test / lab helper — cancel timers and empty the stack. */
export function clearToasts(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}
