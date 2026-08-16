import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearToasts,
  dismissToast,
  getToastSnapshot,
  sanitizeToastHref,
  subscribeToasts,
  toast,
} from "@/lib/client/toasts";

afterEach(() => {
  clearToasts();
});

function toastThenTimeout(tone: "ok" | "info" | "warn" | "danger"): number {
  clearToasts();
  toast({ tone, title: tone });
  const ms = getToastSnapshot()[0]?.timeoutMs;
  assert.ok(ms !== undefined);
  return ms;
}

describe("toast store", () => {
  it("prepends newest and caps at 3", () => {
    toast({ tone: "ok", title: "one" });
    toast({ tone: "ok", title: "two" });
    toast({ tone: "info", title: "three" });
    toast({ tone: "warn", title: "four" });
    const snap = getToastSnapshot();
    assert.equal(snap.length, 3);
    assert.deepEqual(
      snap.map((t) => t.title),
      ["four", "three", "two"],
    );
  });

  it("assigns monotonic t-N ids", () => {
    const a = toast({ tone: "ok", title: "a" });
    const b = toast({ tone: "ok", title: "b" });
    assert.match(a, /^t-\d+$/);
    assert.match(b, /^t-\d+$/);
    const na = Number(a.slice(2));
    const nb = Number(b.slice(2));
    assert.equal(nb, na + 1);
  });

  it("defaults timeoutMs: 3200 for ok/info/warn, 0 for danger", () => {
    assert.equal(toastThenTimeout("ok"), 3200);
    assert.equal(toastThenTimeout("info"), 3200);
    assert.equal(toastThenTimeout("warn"), 3200);
    assert.equal(toastThenTimeout("danger"), 0);
  });

  it("honors explicit timeoutMs including sticky ok", () => {
    toast({ tone: "ok", title: "hold", timeoutMs: 0 });
    assert.equal(getToastSnapshot()[0]?.timeoutMs, 0);
  });

  it("dismissToast removes one and is a no-op for unknown ids", () => {
    const id = toast({ tone: "ok", title: "keep" });
    toast({ tone: "ok", title: "drop" });
    dismissToast("t-nope");
    assert.equal(getToastSnapshot().length, 2);
    dismissToast(id);
    assert.equal(getToastSnapshot().length, 1);
    assert.equal(getToastSnapshot()[0]?.title, "drop");
  });

  it("subscribe fires on toast and dismiss", () => {
    let n = 0;
    const unsub = subscribeToasts(() => {
      n += 1;
    });
    const id = toast({ tone: "ok", title: "ping" });
    dismissToast(id);
    unsub();
    toast({ tone: "ok", title: "after" });
    assert.equal(n, 2);
  });
});

describe("toast href sanitizer", () => {
  it("keeps allowlisted relative paths", () => {
    assert.equal(sanitizeToastHref("/catalog"), "/catalog");
    assert.equal(sanitizeToastHref("/catalog/42"), "/catalog/42");
    assert.equal(sanitizeToastHref("/catalog?q=helix&sort=name"), "/catalog?q=helix&sort=name");
    assert.equal(sanitizeToastHref("/services"), "/services");
    assert.equal(sanitizeToastHref("/acquire"), "/acquire");
    assert.equal(sanitizeToastHref("/collections/7"), "/collections/7");
  });

  it("drops filesystem paths, abs URLs, and other routes", () => {
    assert.equal(sanitizeToastHref(undefined), undefined);
    assert.equal(sanitizeToastHref("/ask"), undefined);
    assert.equal(sanitizeToastHref("/docs"), undefined);
    assert.equal(sanitizeToastHref("/home/brandon/archive/note.md"), undefined);
    assert.equal(sanitizeToastHref("file:///etc/passwd"), undefined);
    assert.equal(sanitizeToastHref("https://example.com/catalog"), undefined);
    assert.equal(sanitizeToastHref("//evil.example/catalog"), undefined);
    assert.equal(sanitizeToastHref("/catalog/../../etc/passwd"), undefined);
    assert.equal(sanitizeToastHref("C:\\\\Windows\\\\file.txt"), undefined);
  });

  it("toast() strips a bad href and keeps a good one", () => {
    toast({
      tone: "ok",
      title: "bad",
      href: "/var/lib/helix/library.db",
    });
    toast({
      tone: "ok",
      title: "good",
      href: "/services",
    });
    const [good, bad] = getToastSnapshot();
    assert.equal(good?.href, "/services");
    assert.equal(bad?.href, undefined);
  });
});
