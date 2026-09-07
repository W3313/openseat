import clsx from "clsx";
import type { GradeValueKind, ProfessorScores } from "@/lib/domain/types";
import { TOOLTIPS, fillTemplate, gpaDeltaTooltip } from "@/lib/copy/tooltips";
import { formatDelta, formatGpa, formatNumber, formatPct, formatRate, formatRating } from "@/lib/utils/format";
import { StatTooltip } from "@/components/ui/StatTooltip";

export interface StatsGridProps {
  scores: ProfessorScores;
  /** `GRADE_YEARS_BACK` for the GPA tooltip. Default 6. */
  yearsBack?: number;
  /** Grades-only schools (design §5) drop the five review stats. Default true. */
  reviewsAvailable?: boolean;
  /** "percent" sources count sections, not students (design §4.1). Default "counts". */
  gradeValueKind?: GradeValueKind;
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

export interface StatItemsOptions {
  reviewsAvailable?: boolean;
  gradeValueKind?: GradeValueKind;
}

/** The 12 stats of SPEC 3.4 item 2 (7 in grades-only mode), formatted with the shared tooltip copy. */
export function statItems(scores: ProfessorScores, yearsBack = 6, opts: StatItemsOptions = {}): StatItem[] {
  const { reviewsAvailable = true, gradeValueKind = "counts" } = opts;
  const s = TOOLTIPS.stats;
  const percent = gradeValueKind === "percent";
  const estimates = Boolean(scores.countsAreEstimates) || percent;
  const deltaText =
    scores.gpaDelta != null || scores.soleInstructor
      ? gpaDeltaTooltip(scores.gpaDelta, scores.deltaComparableN, scores.soleInstructor, gradeValueKind)
      : percent
        ? "Not enough sections in courses others also taught to compute a comparison."
        : "Not enough graded students in courses others also taught to compute a comparison.";
  // §4.1: percent-only deltaComparableN is a scaled estimate, so the hint talks about sections, not students.
  const deltaHint =
    scores.gpaDelta == null ? undefined : percent ? "compared section by section" : `${formatNumber(scores.deltaComparableN)} of this professor's students compared`;
  const deltaValue = scores.gpaDelta != null ? formatDelta(scores.gpaDelta) : scores.soleInstructor ? "Only instructor" : "—";

  const reviewItems: StatItem[] = reviewsAvailable
    ? [
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
      ]
    : [];

  const gradedItem: StatItem =
    gradeValueKind === "percent"
      ? { key: "sectionsGraded", label: s.sectionsGraded.label, value: formatNumber(scores.gradeRows), tooltip: s.sectionsGraded.text, hint: "each section weighs the same" }
      : {
          key: "studentsGraded",
          label: s.studentsGraded.label,
          value: formatNumber(scores.studentsGraded),
          tooltip: estimates ? s.countsAreEstimates.text : s.studentsGraded.text,
          hint: estimates ? "estimated from percentages" : scores.withdrawn ? `${formatNumber(scores.withdrawn)} withdrew` : undefined,
        };

  return [
    ...reviewItems,
    { key: "gpaMean", label: s.gpaMean.label, value: formatGpa(scores.gpaMean), tooltip: fillTemplate(s.gpaMean.text, { years: yearsBack }) },
    { key: "gpaDelta", label: "Δ vs course", value: deltaValue, tooltip: deltaText, hint: deltaHint },
    { key: "wRate", label: s.wRate.label, value: formatRate(scores.wRate), tooltip: s.wRate.text },
    { key: "dfwRate", label: s.dfwRate.label, value: formatRate(scores.dfwRate), tooltip: s.dfwRate.text },
    gradedItem,
    // Percent-only: "Sections graded" already is the row count, so the separate "Grade rows" tile would repeat it.
    ...(percent ? [] : [{ key: "gradeRows", label: s.gradeRows.label, value: formatNumber(scores.gradeRows), tooltip: s.gradeRows.text }]),
    { key: "yearsActive", label: s.yearsActive.label, value: formatNumber(scores.yearsActive), tooltip: s.yearsActive.text },
  ];
}

/** Labelled numbers, each with a `StatTooltip` (SPEC 3.4 item 2). */
export function StatsGrid({ scores, yearsBack = 6, reviewsAvailable = true, gradeValueKind = "counts", className }: StatsGridProps) {
  const items = statItems(scores, yearsBack, { reviewsAvailable, gradeValueKind });
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
