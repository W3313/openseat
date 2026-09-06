import clsx from "clsx";
import { ThumbsUp } from "lucide-react";
import type { Review } from "@/lib/domain/types";
import { formatDateOnly } from "@/lib/utils/format";
import { Chip } from "@/components/ui/Chip";
import { VibeTags } from "./VibeTags";

export interface ReviewCardProps {
  review: Review;
  /** Highlighted when the AI summary cites this review (evidence link target). */
  cited?: boolean;
  className?: string;
}

/** DOM id used by the AI summary's "Why this?" anchors. */
export function reviewAnchorId(reviewId: string): string {
  return `review-${reviewId}`;
}

/** "★ 4 · difficulty 3 · CS 225 · May 14, 2025" */
export function reviewMeta(review: Pick<Review, "quality" | "difficulty" | "courseLabel" | "date">): string {
  const parts = [`★ ${review.quality}`];
  if (review.difficulty != null) parts.push(`difficulty ${review.difficulty}`);
  if (review.courseLabel) parts.push(review.courseLabel);
  parts.push(formatDateOnly(review.date));
  return parts.join(" · ");
}

/** One full review (SPEC 3.4 item 7). `id="review-{id}"` so evidence links can jump here. */
export function ReviewCard({ review, cited = false, className }: ReviewCardProps) {
  const tone = review.quality >= 4 ? "text-success" : review.quality <= 2 ? "text-danger" : "text-ink";
  return (
    <article
      id={reviewAnchorId(review.id)}
      aria-label={`Review, ${review.quality} out of 5`}
      className={clsx(
        "flex flex-col gap-2 rounded-card border bg-surface-raised p-4 target:ring-2 target:ring-brand",
        cited ? "border-brand/60" : "border-border",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="flex flex-wrap items-center gap-x-2 tabular-nums">
          <span className={clsx("font-semibold", tone)}>★ {review.quality}</span>
          {review.difficulty != null ? <span>difficulty {review.difficulty}</span> : null}
          {review.courseLabel ? <span className="font-medium text-ink">{review.courseLabel}</span> : null}
          <time dateTime={review.date}>{formatDateOnly(review.date)}</time>
          {review.gradeReceived ? <span>grade {review.gradeReceived}</span> : null}
          {review.wouldTakeAgain != null ? <span>{review.wouldTakeAgain ? "would take again" : "would not take again"}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          {cited ? (
            <Chip size="sm" tone="brand">
              cited by summary
            </Chip>
          ) : null}
          <span className="inline-flex items-center gap-1" title="Helpful votes">
            <ThumbsUp aria-hidden="true" className="h-3 w-3" />
            <span className="sr-only">Helpful votes: </span>
            {review.helpfulVotes}
          </span>
        </span>
      </header>
      <p className="m-0 text-sm leading-relaxed text-ink">{review.text}</p>
      {review.sourceTags.length || review.vibeTags.length ? (
        <footer className="flex flex-wrap items-center gap-1">
          {review.sourceTags.map((t) => (
            <Chip key={t} size="sm" tone="neutral">
              {t}
            </Chip>
          ))}
          <VibeTags tags={review.vibeTags} max={Infinity} />
        </footer>
      ) : null}
    </article>
  );
}

export default ReviewCard;
