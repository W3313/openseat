import { Skeleton } from "@/components/ui/Skeleton";
import { CardSkeletonList } from "@/components/rankings/CardSkeleton";

/** Rankings route skeleton (F13): header silhouette + 6 card skeletons. */
export default function RankingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-56 rounded-chip" />
          <Skeleton className="h-6 w-40 rounded-chip" />
        </div>
        <Skeleton className="h-4 w-72" />
      </div>
      <CardSkeletonList count={6} label="Loading rankings" />
    </div>
  );
}
