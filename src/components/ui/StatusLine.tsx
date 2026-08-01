import { cn } from "@/lib/cn";

export function StatusLine({
  tone = "muted",
  pulse = false,
  children,
  className,
}: {
  tone?: "ok" | "warn" | "danger" | "info" | "muted";
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "status",
        `status-${tone}`,
        pulse && "status-pulse",
        className,
      )}
      role="status"
    >
      <span className="status-dot" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
