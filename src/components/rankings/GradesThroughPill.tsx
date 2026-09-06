import type { TermCode } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { gradeWindowStartTerm, termDisplay } from "@/lib/utils/term";

export interface GradesThroughPillProps {
  gradesThroughTerm: TermCode;
  /** The term rankings are built for; the window start is `currentTerm − yearsBack` years. */
  currentTerm: TermCode;
  /** `GRADE_YEARS_BACK` (default 6). */
  yearsBack?: number;
  className?: string;
}

/** "Grades through Spring 2026" */
export function gradesThroughLabel(gradesThroughTerm: TermCode): string {
  return `${TOOLTIPS.stats.gradesThrough.label} ${termDisplay(gradesThroughTerm)}`;
}

/** "Grade rows from Fall 2020 through Spring 2026. Newer terms are not in the public dataset yet." */
export function gradesThroughTooltip(gradesThroughTerm: TermCode, currentTerm: TermCode, yearsBack = 6): string {
  return fillTemplate(TOOLTIPS.stats.gradesThrough.text, {
    windowStart: termDisplay(gradeWindowStartTerm(currentTerm, yearsBack)),
    windowEnd: termDisplay(gradesThroughTerm),
  });
}

/** F14: the grade dataset lags the schedule; say so in the header. */
export function GradesThroughPill({ gradesThroughTerm, currentTerm, yearsBack = 6, className }: GradesThroughPillProps) {
  return (
    <StatTooltip label="Which terms are the grades from?" content={gradesThroughTooltip(gradesThroughTerm, currentTerm, yearsBack)} className={className}>
      <Chip tone="neutral" size="md">
        {gradesThroughLabel(gradesThroughTerm)}
      </Chip>
    </StatTooltip>
  );
}

export default GradesThroughPill;
