import { cn } from "@/lib/cn";

export function Surface({
  children,
  className,
  as: Tag = "div",
  variant = "raised",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "article";
  variant?: "raised" | "flat" | "inset";
}) {
  const v =
    variant === "flat"
      ? "surface-flat"
      : variant === "inset"
        ? "surface-inset"
        : "surface";
  return <Tag className={cn(v, className)}>{children}</Tag>;
}
