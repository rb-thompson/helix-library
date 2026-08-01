"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function SearchForm({
  defaultQuery = "",
  action = "/catalog",
  large = false,
}: {
  defaultQuery?: string;
  action?: string;
  large?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultQuery);

  useEffect(() => {
    setValue(defaultQuery);
  }, [defaultQuery]);

  return (
    <form action={action} method="get" className="w-full" role="search">
      <label htmlFor={id} className="sr-only">
        Search the catalog
      </label>
      <div className={cn("search-shell", large && "large", large ? "text-base" : "text-sm")}>
        <span className="flex items-center pl-3 text-[var(--muted-faint)]">
          <Search className={large ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
        </span>
        <input
          ref={inputRef}
          id={id}
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Name, path, notes, PDF text…  (press /)"
          title="Search by name, path, title, note body, or PDF text. Press / to focus."
          autoComplete="off"
          enterKeyHint="search"
        />
        {value ? (
          <button
            type="button"
            className="flex items-center px-2 text-[var(--muted)] hover:text-[var(--ink)]"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <button type="submit" className="search-submit" title="Search catalog">
          Search
        </button>
      </div>
    </form>
  );
}
