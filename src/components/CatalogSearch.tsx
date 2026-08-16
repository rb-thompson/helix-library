"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  catalogHrefFromFormData,
  catalogHrefPageView,
} from "@/lib/catalog/href";

const DEBOUNCE_MS = 180;

export type CatalogNavigateOpts = {
  history: "replace" | "push";
  scroll: boolean;
  scrollResults?: boolean;
};

export type CatalogNav = {
  navigate: (href: string, opts: CatalogNavigateOpts) => void;
  isPending: boolean;
  pendingHref: string | null;
};

const CatalogNavContext = createContext<CatalogNav | null>(null);

export function useCatalogNav(): CatalogNav {
  const ctx = useContext(CatalogNavContext);
  if (!ctx) {
    throw new Error("useCatalogNav must be used inside CatalogSearch");
  }
  return ctx;
}

export function useCatalogNavOptional(): CatalogNav | null {
  return useContext(CatalogNavContext);
}

export function CatalogNavLink({
  href,
  className,
  title,
  children,
  scrollResults = false,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
  scrollResults?: boolean;
}) {
  const nav = useCatalogNavOptional();
  if (!nav) {
    return (
      <Link href={href} className={className} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      title={title}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        nav.navigate(href, {
          history: "push",
          scroll: false,
          scrollResults,
        });
      }}
    >
      {children}
    </Link>
  );
}

function hrefFromRoot(root: HTMLElement): string {
  const fd = new FormData();
  const filters = root.querySelector<HTMLFormElement>("form.catalog-filters");
  const search = root.querySelector<HTMLFormElement>('form[role="search"]');
  if (filters) {
    for (const [k, v] of new FormData(filters)) {
      if (typeof v === "string") fd.set(k, v);
    }
  }
  if (search) {
    for (const [k, v] of new FormData(search)) {
      if (typeof v === "string") fd.set(k, v);
    }
  }
  return catalogHrefFromFormData(fd);
}

export function CatalogSearch({ children }: { children: ReactNode }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const navGen = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  const navigate = useCallback(
    (href: string, opts: CatalogNavigateOpts) => {
      const my = ++navGen.current;
      setPendingHref(href);
      startTransition(() => {
        if (my !== navGen.current) return;
        if (opts.history === "replace") {
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
        if (opts.scrollResults) {
          document
            .getElementById("catalog-results")
            ?.scrollIntoView({ block: "start" });
        }
      });
    },
    [router],
  );

  const flushText = useCallback(
    (history: "replace" | "push") => {
      const root = rootRef.current;
      if (!root) return;
      navigate(hrefFromRoot(root), { history, scroll: false });
    },
    [navigate],
  );

  const scheduleText = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      flushText("replace");
    }, DEBOUNCE_MS);
  }, [flushText]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onInput(e: Event) {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.name !== "q" && t.name !== "under") return;
      scheduleText();
    }

    function onChange(e: Event) {
      const t = e.target;
      if (!(t instanceof HTMLSelectElement)) return;
      if (!t.closest("form.catalog-filters")) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      flushText("push");
    }

    function onSubmit(e: Event) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.getAttribute("method")?.toLowerCase() !== "get") return;
      if (!form.matches('form[role="search"], form.catalog-filters')) return;
      e.preventDefault();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      flushText("push");
    }

    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    return () => {
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.removeEventListener("submit", onSubmit);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [flushText, scheduleText]);

  const value: CatalogNav = { navigate, isPending, pendingHref };

  return (
    <CatalogNavContext.Provider value={value}>
      <div
        ref={rootRef}
        data-catalog-search=""
        data-catalog-hydrated={hydrated ? "" : undefined}
      >
        {children}
      </div>
    </CatalogNavContext.Provider>
  );
}

export { catalogHrefPageView };
