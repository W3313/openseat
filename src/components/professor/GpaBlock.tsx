import clsx from "clsx";
import type { ProfessorScores } from "@/lib/domain/types";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { Chip } from "@/components/ui/Chip";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { formatGpa, formatRate } from "@/lib/utils/format";
import { DeltaChip } from "./DeltaChip";

export interface GpaBlockProps {
  scores: Pick<ProfessorScores, "gpaMean" | "gpaDelta" | "deltaComparableN" | "soleInstructor" | "wRate" | "studentsGraded">;
  /** Grade window length, for the GPA tooltip. Default 6. */
  yearsBack?: number;
  deltaSuffix?: string;
  className?: string;
}

/**
 * "GPA 3.41" + `DeltaChip` + secondary "W 3.2%" (SPEC 3.2 item 5). When the
 * professor has no graded rows in the window the block collapses to the
 * "New — no grade data yet" pill (F14).
 */
export function GpaBlock({ scores, yearsBack = 6, deltaSuffix, className }: GpaBlockProps) {
  if (scores.studentsGraded === 0) {
    return (
      <div className={clsx("flex flex-col gap-0.5", className)}>
        <StatTooltip label="Why is there no grade data?" content={TOOLTIPS.stats.noGradeData.text}>
          <Chip tone="info" size="sm">
            {TOOLTIPS.stats.noGradeData.label}
          </Chip>
        </StatTooltip>
      </div>
    );
  }
  return (
    <div className={clsx("flex flex-col gap-0.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <StatTooltip
          label="What does GPA mean here?"
          content={fillTemplate(TOOLTIPS.stats.gpaMean.text, { years: yearsBack })}
        >
          <span className="text-sm font-semibold tabular-nums text-ink">
            <span className="text-ink-muted">GPA </span>
            {formatGpa(scores.gpaMean)}
          </span>
        </StatTooltip>
        <DeltaChip scores={scores} suffix={deltaSuffix} size="sm" />
      </div>
      <StatTooltip label="What is the W rate?" content={TOOLTIPS.stats.wRate.text} className="self-start">
        <span className="text-xs tabular-nums text-ink-muted">W {formatRate(scores.wRate)}</span>
      </StatTooltip>
    </div>
  );
}

export default GpaBlock;
