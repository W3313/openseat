import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui/Skeleton";

/** Professor route skeleton (SPEC 3.0): header silhouette + 3 block skeletons. */
export default function ProfessorLoading() {
  return (
    <SkeletonRegion label="Loading professor" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-chip" />
          <Skeleton className="h-6 w-28 rounded-chip" />
          <Skeleton className="h-6 w-20 rounded-chip" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-20" />
          <SkeletonText lines={2} className="w-48" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card border border-border bg-surface-raised p-4">
          <Skeleton className="mb-3 h-5 w-40" />
          <SkeletonText lines={4} />
        </div>
      ))}
    </SkeletonRegion>
  );
}
