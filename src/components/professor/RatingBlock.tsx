import clsx from "clsx";
import type { ProfessorScores } from "@/lib/domain/types";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { MIN_REVIEWS_RANKED } from "@/lib/domain/constants";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { formatRating, pluralize } from "@/lib/utils/format";
import { ConfidenceDots } from "./ConfidenceDots";

export interface RatingBlockProps {
  scores: Pick<ProfessorScores, "ratingShrunk" | "ratingRaw" | "reviewCount" | "confidence">;
  /** "compact" (card) or "large" (detail header). */
  size?: "compact" | "large";
  className?: string;
}

/** Tooltip text with the raw average and review count filled in (SPEC 8.4). */
export function ratingTooltipText(scores: RatingBlockProps["scores"]): string {
  return fillTemplate(TOOLTIPS.stats.ratingShrunk.text, {
    ratingRaw: scores.ratingRaw == null ? null : scores.ratingRaw.toFixed(2),
    n: scores.reviewCount,
  });
}

/**
 * "4.6 ★" (shrunk, 1 dp) + `ConfidenceDots` + "23 reviews" — always adjacent
 * (SPEC F8). The number is the `StatTooltip` trigger so the explanation is one
 * tap away.
 */
export function RatingBlock({ scores, size = "compact", className }: RatingBlockProps) {
  const rating = formatRating(scores.ratingShrunk);
  const large = size === "large";
  return (
    <div className={clsx("flex flex-col", large ? "gap-1" : "gap-0.5", className)}>
      <div className="flex items-center gap-2">
        {scores.reviewCount < MIN_REVIEWS_RANKED ? (
          <StatTooltip label="Why is there no rating?" content={TOOLTIPS.stats.lowData.text}>
            <span className={clsx("font-medium text-ink-muted", large ? "text-lg" : "text-sm")}>{TOOLTIPS.stats.lowData.label}</span>
          </StatTooltip>
        ) : (
          <StatTooltip label="What does this rating mean?" content={ratingTooltipText(scores)}>
            <span className={clsx("font-semibold tabular-nums text-ink", large ? "text-3xl" : "text-lg")}>
              {rating}
              <span aria-hidden="true" className="ml-0.5 text-warning">
                ★
              </span>
              <span className="sr-only"> out of 5</span>
            </span>
          </StatTooltip>
        )}
        <ConfidenceDots confidence={scores.confidence} />
      </div>
      <span className={clsx("text-ink-muted", large ? "text-sm" : "text-xs")}>
        {pluralize(scores.reviewCount, "review")}
      </span>
    </div>
  );
}

export default RatingBlock;
