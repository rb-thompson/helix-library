import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  register = "desk",
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Type register. No page migrations this PR — default stays desk. */
  register?: "desk" | "catalog" | "room";
}) {
  const titleClass =
    register === "catalog"
      ? "type-catalog"
      : register === "room"
        ? "type-room"
        : "page-title type-desk";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className={cn(titleClass, eyebrow && "mt-1")}>{title}</h1>
        {description ? <div className="page-sub max-w-2xl">{description}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
