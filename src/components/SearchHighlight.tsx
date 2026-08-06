import { highlightSegments } from "@/lib/catalog/snippet";

/**
 * Render text with query tokens wrapped in <mark class="search-hit">.
 * Safe: no HTML injection — tokens only control split points.
 */
export function SearchHighlight({
  text,
  tokens,
  className,
}: {
  text: string;
  tokens: string[];
  className?: string;
}) {
  if (!tokens.length) {
    return <span className={className}>{text}</span>;
  }
  const parts = highlightSegments(text, tokens);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="search-hit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
