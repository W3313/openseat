import clsx from "clsx";
import type { ProfessorScores } from "@/lib/domain/types";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { formatDelta, formatNumber } from "@/lib/utils/format";

export interface DeltaChipProps {
  scores: Pick<ProfessorScores, "gpaDelta" | "deltaComparableN" | "soleInstructor">;
  /** Suffix after the number. Default "vs course" (subject page); the course page passes "vs others". */
  suffix?: string;
  size?: "sm" | "md";
  className?: string;
}

export type DeltaTone = "up" | "down" | "flat";

/** ±0.05 GPA points is rendered neutral. */
export function deltaTone(delta: number): DeltaTone {
  if (delta >= 0.05) return "up";
  if (delta <= -0.05) return "down";
  return "flat";
}

/** Visible chip text: "+0.31 vs course" | "only instructor on record" | "no comparison". */
export function deltaChipText(scores: DeltaChipProps["scores"], suffix = "vs course"): string {
  if (scores.gpaDelta != null) return `${formatDelta(scores.gpaDelta)} ${suffix}`;
  if (scores.soleInstructor) return TOOLTIPS.stats.gpaDeltaSole.label.toLowerCase();
  return "no comparison";
}

export function deltaTooltipText(scores: DeltaChipProps["scores"]): string {
  if (scores.gpaDelta != null) {
    return fillTemplate(TOOLTIPS.stats.gpaDelta.text, {
      absDelta: Math.abs(scores.gpaDelta).toFixed(2),
      direction: scores.gpaDelta >= 0 ? "above" : "below",
      n: formatNumber(scores.deltaComparableN),
    });
  }
  if (scores.soleInstructor) return TOOLTIPS.stats.gpaDeltaSole.text;
  return "Not enough graded students in courses others also taught to compute a comparison.";
}

const TONE_CLASSES: Record<DeltaTone | "none", string> = {
  up: "bg-success-soft text-success",
  down: "bg-danger-soft text-danger",
  flat: "bg-surface-sunken text-ink-muted",
  none: "bg-surface-sunken text-ink-muted",
};

/**
 * Leave-one-out GPA delta chip (SPEC F5 / 8.3): "+0.31 vs course", or
 * "only instructor on record" when every course lacked a comparison group.
 * The whole chip is the `StatTooltip` trigger.
 */
export function DeltaChip({ scores, suffix = "vs course", size = "md", className }: DeltaChipProps) {
  const tone: DeltaTone | "none" = scores.gpaDelta != null ? deltaTone(scores.gpaDelta) : "none";
  return (
    <StatTooltip label="How does this compare to the course average?" content={deltaTooltipText(scores)} className={className}>
      <span
        className={clsx(
          "inline-flex items-center rounded-chip px-2 font-medium tabular-nums leading-none whitespace-nowrap",
          size === "sm" ? "h-5 text-[0.7rem]" : "h-6 text-xs",
          TONE_CLASSES[tone],
        )}
      >
        {deltaChipText(scores, suffix)}
      </span>
    </StatTooltip>
  );
}

export default DeltaChip;
