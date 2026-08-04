"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

/**
 * Renders librarian replies: compact markdown + /catalog/N deep links.
 * Action tokens should be stripped by the parent and rendered as buttons.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const components: Components = {
    h1: ({ children }) => (
      <h3 className="chat-md-h mt-0 text-base font-semibold tracking-tight text-[var(--ink)]">
        {children}
      </h3>
    ),
    h2: ({ children }) => (
      <h3 className="chat-md-h mt-3 text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)] first:mt-0">
        {children}
      </h3>
    ),
    h3: ({ children }) => (
      <h4 className="chat-md-h mt-2.5 text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-[var(--accent)] first:mt-0">
        {children}
      </h4>
    ),
    h4: ({ children }) => (
      <h4 className="chat-md-h mt-2 text-sm font-semibold text-[var(--ink-soft)] first:mt-0">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="chat-md-p mt-1.5 text-[0.875rem] leading-relaxed text-[var(--ink)] first:mt-0">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="chat-md-ul mt-1.5 list-disc space-y-1 pl-4 text-[0.875rem] leading-snug text-[var(--ink)]">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="chat-md-ol mt-1.5 list-decimal space-y-1 pl-4 text-[0.875rem] leading-snug text-[var(--ink)]">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-0.5 marker:text-[var(--muted)]">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-[var(--ink)]">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-[var(--ink-soft)]">{children}</em>,
    a: ({ href, children }) => {
      const h = href ?? "";
      if (h.startsWith("/")) {
        return (
          <Link
            href={h}
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {children}
          </Link>
        );
      }
      return (
        <a
          href={h}
          className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {children}
        </a>
      );
    },
    code: ({ children, className }) => {
      const block = className?.includes("language-");
      if (block) {
        return (
          <code className="mt-2 block overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--paper-deep)] px-2.5 py-2 font-mono text-[0.75rem] text-[var(--ink-soft)]">
            {children}
          </code>
        );
      }
      return (
        <code className="rounded bg-[var(--paper-deep)] px-1 py-0.5 font-mono text-[0.8em] text-[var(--ink-soft)]">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mt-2 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--paper-deep)] p-0">
        {children}
      </pre>
    ),
    hr: () => <hr className="my-3 border-[var(--line)]" />,
    blockquote: ({ children }) => (
      <blockquote className="mt-2 border-l-2 border-[var(--accent)] pl-3 text-[0.875rem] text-[var(--ink-soft)]">
        {children}
      </blockquote>
    ),
  };

  // Turn bare /catalog/123 into markdown links so they render as anchors
  const withCatalogLinks = text.replace(
    /(^|[\s(])(\/catalog\/\d+)\b/g,
    "$1[$2]($2)",
  );

  return (
    <div className="chat-md">
      <ReactMarkdown components={components}>{withCatalogLinks}</ReactMarkdown>
    </div>
  );
}
