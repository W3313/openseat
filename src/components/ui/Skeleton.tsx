import type { CSSProperties } from "react";
import clsx from "clsx";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Shape shortcut. Default "rect". */
  shape?: "rect" | "circle" | "text";
}

/**
 * Loading placeholder. Purely decorative (`aria-hidden`); the surrounding
 * `loading.tsx` should carry a single `role="status"` "Loading…" label
 * (see `SkeletonRegion`).
 */
export function Skeleton({ className, style, shape = "rect" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={clsx(
        "block animate-pulse bg-surface-sunken dark:bg-surface-overlay",
        shape === "circle" ? "rounded-full" : shape === "text" ? "h-3.5 rounded" : "rounded-md",
        className,
      )}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Several text-line skeletons with a shorter last line. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span aria-hidden="true" className={clsx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} shape="text" className={i === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </span>
  );
}

export interface SkeletonRegionProps {
  /** Announced to assistive tech, e.g. "Loading rankings". */
  label: string;
  children: React.ReactNode;
  className?: string;
}

/** Wraps a group of skeletons in one polite live region with a hidden label. */
export function SkeletonRegion({ label, children, className }: SkeletonRegionProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export default Skeleton;
