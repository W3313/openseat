import clsx from "clsx";
import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui/Skeleton";

/** Placeholder with the same silhouette as a collapsed `ProfessorCard` (F13). */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={clsx("rounded-card border border-border bg-surface-raised p-4 shadow-card", className)}>
      <div className="flex items-start gap-3">
        <Skeleton className="h-7 w-7 shrink-0" shape="circle" />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-chip" />
            <Skeleton className="h-5 w-20 rounded-chip" />
          </div>
          <div className="grid gap-3 sm:grid-cols-[8rem_10rem_1fr]">
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
            <Skeleton className="h-3.5 w-full self-center" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-5 w-10 rounded-chip" />
            <Skeleton className="h-5 w-10 rounded-chip" />
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CardSkeletonListProps {
  count?: number;
  label?: string;
  className?: string;
}

/** `loading.tsx` body: 6 skeleton cards in one polite live region. */
export function CardSkeletonList({ count = 6, label = "Loading rankings", className }: CardSkeletonListProps) {
  return (
    <SkeletonRegion label={label} className={clsx("flex flex-col gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </SkeletonRegion>
  );
}

export default CardSkeleton;
