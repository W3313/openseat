import clsx from "clsx";
import type { ProfessorScores } from "@/lib/domain/types";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { formatDelta, formatGpa, formatNumber, formatPct, formatRate, formatRating } from "@/lib/utils/format";
import { StatTooltip } from "@/components/ui/StatTooltip";

export interface StatsGridProps {
  scores: ProfessorScores;
  /** `GRADE_YEARS_BACK` for the GPA tooltip. Default 6. */
  yearsBack?: number;
  className?: string;
}

export interface StatItem {
  key: string;
  label: string;
  value: string;
  tooltip: string;
  /** Secondary line, e.g. "raw 4.42". */
  hint?: string;
}

/** The 12 stats of SPEC 3.4 item 2, formatted with the shared tooltip copy. */
export function statItems(scores: ProfessorScores, yearsBack = 6): StatItem[] {
  const s = TOOLTIPS.stats;
  const deltaText =
    scores.gpaDelta != null
      ? fillTemplate(s.gpaDelta.text, {
          absDelta: Math.abs(scores.gpaDelta).toFixed(2),
          direction: scores.gpaDelta >= 0 ? "above" : "below",
          n: formatNumber(scores.deltaComparableN),
        })
      : scores.soleInstructor
        ? s.gpaDeltaSole.text
        : "Not enough graded students in courses others also taught to compute a comparison.";
  const deltaValue = scores.gpaDelta != null ? formatDelta(scores.gpaDelta) : scores.soleInstructor ? "Only instructor" : "—";

  return [
    {
      key: "ratingShrunk",
      label: s.ratingShrunk.label,
      value: scores.ratingShrunk == null ? "—" : `${formatRating(scores.ratingShrunk)} ★`,
      tooltip: fillTemplate(s.ratingShrunk.text, { ratingRaw: scores.ratingRaw == null ? "—" : scores.ratingRaw.toFixed(2), n: scores.reviewCount }),
      hint: `prior ${scores.priorMean.toFixed(2)}`,
    },
    { key: "ratingRaw", label: s.ratingRaw.label, value: scores.ratingRaw == null ? "—" : scores.ratingRaw.toFixed(2), tooltip: s.ratingRaw.text },
    {
      key: "reviewCount",
      label: s.reviewCount.label,
      value: formatNumber(scores.reviewCount),
      tooltip: s.reviewCount.text,
      hint: scores.reviewCount ? `${scores.positiveCount} positive · ${scores.criticalCount} critical` : undefined,
    },
    { key: "wouldTakeAgain", label: s.wouldTakeAgain.label, value: formatPct(scores.wouldTakeAgainPct), tooltip: s.wouldTakeAgain.text },
    { key: "difficulty", label: s.difficulty.label, value: scores.difficultyMean == null ? "—" : `${scores.difficultyMean.toFixed(1)} / 5`, tooltip: s.difficulty.text },
    { key: "gpaMean", label: s.gpaMean.label, value: formatGpa(scores.gpaMean), tooltip: fillTemplate(s.gpaMean.text, { years: yearsBack }) },
    { key: "gpaDelta", label: "Δ vs course", value: deltaValue, tooltip: deltaText, hint: scores.gpaDelta != null ? `${formatNumber(scores.deltaComparableN)} of this professor's students compared` : undefined },
    { key: "wRate", label: s.wRate.label, value: formatRate(scores.wRate), tooltip: s.wRate.text },
    { key: "dfwRate", label: s.dfwRate.label, value: formatRate(scores.dfwRate), tooltip: s.dfwRate.text },
    { key: "studentsGraded", label: s.studentsGraded.label, value: formatNumber(scores.studentsGraded), tooltip: s.studentsGraded.text, hint: scores.withdrawn ? `${formatNumber(scores.withdrawn)} withdrew` : undefined },
    { key: "gradeRows", label: s.gradeRows.label, value: formatNumber(scores.gradeRows), tooltip: s.gradeRows.text },
    { key: "yearsActive", label: s.yearsActive.label, value: formatNumber(scores.yearsActive), tooltip: s.yearsActive.text },
  ];
}

/** Twelve labelled numbers, each with a `StatTooltip` (SPEC 3.4 item 2). */
export function StatsGrid({ scores, yearsBack = 6, className }: StatsGridProps) {
  const items = statItems(scores, yearsBack);
  return (
    <dl aria-label="Professor statistics" className={clsx("m-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-raised px-3 py-2">
          <dt className="flex items-center gap-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink-faint">
            {item.label}
            <StatTooltip label={`What does ${item.label} mean?`} content={item.tooltip} />
          </dt>
          <dd className="m-0 text-lg font-semibold tabular-nums text-ink">{item.value}</dd>
          {item.hint ? <dd className="m-0 text-xs text-ink-muted">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export default StatsGrid;
