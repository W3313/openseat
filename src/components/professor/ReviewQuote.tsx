import clsx from "clsx";
import { ThumbsUp } from "lucide-react";
import type { Review } from "@/lib/domain/types";
import { formatMonthYear } from "@/lib/utils/format";
import { QUOTE_MAX_CHARS } from "@/lib/domain/constants";

export interface ReviewQuoteProps {
  review: Pick<Review, "id" | "quality" | "courseLabel" | "date" | "text" | "helpfulVotes">;
  /** Truncate long quotes at a word boundary (card). Default true. */
  truncate?: boolean;
  className?: string;
}

/** Card-side safety net: ≤ QUOTE_MAX_CHARS at the last word boundary with "…" (SPEC 8.10). */
export function clampQuote(text: string, max = QUOTE_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!?-]+$/, "")}…`;
}

/** "★ 5 · CS 225 · May 2025" */
export function reviewMetaLine(review: ReviewQuoteProps["review"]): string {
  return [`★ ${review.quality}`, review.courseLabel, formatMonthYear(review.date)].filter(Boolean).join(" · ");
}

/**
 * One positive-review preview (SPEC F6): the quote, "★ 5 · CS 225 · May 2025",
 * and the helpful count.
 */
export function ReviewQuote({ review, truncate = true, className }: ReviewQuoteProps) {
  const text = truncate ? clampQuote(review.text) : review.text;
  return (
    <figure className={clsx("m-0 flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken/60 p-3", className)}>
      <blockquote className="m-0 text-sm leading-snug text-ink">
        <span aria-hidden="true">“</span>
        {text}
        <span aria-hidden="true">”</span>
      </blockquote>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>
          <span className="sr-only">Rated {review.quality} out of 5</span>
          <span aria-hidden="true">{reviewMetaLine(review)}</span>
          <span className="sr-only">
            {review.courseLabel ? ` · ${review.courseLabel}` : ""} · {formatMonthYear(review.date)}
          </span>
        </span>
        {review.helpfulVotes > 0 ? (
          <span className="inline-flex items-center gap-1" title="Students who found this review helpful">
            <ThumbsUp aria-hidden="true" className="h-3 w-3" />
            <span>
              {review.helpfulVotes}
              <span className="sr-only"> found this helpful</span>
            </span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export default ReviewQuote;
