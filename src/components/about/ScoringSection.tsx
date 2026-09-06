import type { TermCode } from '@/lib/domain/types';
import {
  COMPOSITE_WEIGHTS, CONFIDENCE_THRESHOLDS, GPA_POINTS, MIN_BADGE_N, MIN_BASELINE_N, MIN_GRADED_N, MIN_REVIEWS_RANKED,
  PRIOR_FALLBACK, PRIOR_MIN_REVIEWS, SHRINK_K,
} from '@/lib/domain/constants';
import { TA_SCHED_TYPES } from '@/lib/domain/types';
import { gradeWindowStartTerm, termDisplay } from '@/lib/utils/term';
import { FormulaBlock } from './FormulaBlock';

export interface ScoringSectionProps {
  currentTerm: TermCode;
  gradesThroughTerm: TermCode;
  yearsBack: number;
}

const GPA_POINTS_LINE = Object.entries(GPA_POINTS)
  .map(([k, v]) => `${k}=${v.toFixed(2)}`)
  .join('  ');

/** SPEC 3.6 `#scoring`: the Section 8 formulas verbatim, each with constants and a worked example. */
export function ScoringSection({ currentTerm, gradesThroughTerm, yearsBack }: ScoringSectionProps) {
  const windowStart = gradeWindowStartTerm(currentTerm, yearsBack);
  return (
    <>
      <p>
        Every number on a card is a pure function of the processed JSON, unit-tested against hand-computed expectations.
        Constants live in <code>src/lib/domain/constants.ts</code>; the values printed here are read from that file.
      </p>

      <FormulaBlock
        title="8.1 Row-level GPA, rates and suppression"
        formula={`graded   = Σ letter counts (13 buckets, excludes W)
students = graded + W
gpa      = Σ(count_g × GPA_POINTS[g]) / graded        (null when graded === 0)
aRate    = (A+ + A + A−) / graded
wRate    = W / students
dfwRate  = (D+ + D + D− + F + W) / students
suppressed = graded < MIN_GRADED_N                    (excluded from every aggregate, kept for provenance)
isHeadline = !TA_SCHED_TYPES.has(schedType)           (only headline rows feed professor/course stats)
inWindow   = ordinal(term) ≥ ordinal(currentTerm) − 10 × GRADE_YEARS_BACK`}
        constants={[
          { name: 'MIN_GRADED_N', value: MIN_GRADED_N },
          { name: 'GRADE_YEARS_BACK', value: yearsBack },
          { name: 'TA_SCHED_TYPES', value: [...TA_SCHED_TYPES].join(', ') },
        ]}
      >
        <p className="font-mono text-xs">{GPA_POINTS_LINE}</p>
        <p>
          <strong>Window:</strong> grade rows from {termDisplay(windowStart)} through {termDisplay(gradesThroughTerm)} (the
          public dataset lags the schedule term). <strong>Worked example:</strong> a row with 12 A, 6 B, 2 C, 1 W has
          graded = 20, students = 21, gpa = (12×4.00 + 6×3.00 + 2×2.00) / 20 = 3.50, wRate = 1/21 = 4.8 %. A row with 9
          graded students is suppressed; one with 10 is not.
        </p>
      </FormulaBlock>

      <FormulaBlock
        title="8.2 Professor aggregates"
        formula={`over headline, in-window, non-suppressed rows attributed to the professor within scope:
gradeRows = count      studentsGraded = Σ graded      withdrawn = Σ W      yearsActive = |distinct year|
gpaMean   = Σ(row.gpa × row.graded) / studentsGraded    (null when studentsGraded < MIN_GRADED_N)
aRate, wRate, dfwRate from the summed buckets (8.1)
gpaByYear = per year, enrollment-weighted GPA with n = Σ graded; keep years with n ≥ MIN_GRADED_N`}
      >
        <p>
          Scope is the subject on a rankings page, the course on a course page and everything on the detail page, so the
          same professor can legitimately show a different GPA on <code>/s/uiuc/CS</code> and <code>/s/uiuc/ECE</code>.
        </p>
      </FormulaBlock>

      <FormulaBlock
        title="8.3 Leave-one-out course delta (“vs course”)"
        formula={`for each course c the professor P has headline rows in:
  gpa_c(P)       = weighted GPA over P's rows in c;  n_c(P) = Σ graded
  baseline_c(¬P) = weighted GPA over ALL OTHER headline, in-window, non-suppressed rows in c
                   (other professors, grades-only entities and empty-instructor rows)
  delta_c        = gpa_c(P) − baseline_c(¬P)   if baselineN_c ≥ MIN_BASELINE_N and n_c(P) ≥ MIN_GRADED_N, else excluded
gpaDelta         = Σ_c n_c(P) × delta_c / Σ_c n_c(P)        deltaComparableN = Σ_c n_c(P) over included courses
gpaDelta = null when deltaComparableN < MIN_GRADED_N
soleInstructor   = has rows, but every course was excluded because baselineN_c < MIN_BASELINE_N`}
        constants={[
          { name: 'MIN_BASELINE_N', value: MIN_BASELINE_N },
          { name: 'MIN_GRADED_N', value: MIN_GRADED_N },
        ]}
      >
        <p>
          <strong>Worked example:</strong> P taught CS 225 (200 students, GPA 3.40; everyone else 3.10 over 900 students)
          and CS 374 (100 students, GPA 2.90; everyone else 3.00 over 400). delta = (200×0.30 + 100×(−0.10)) / 300 =
          +0.167, deltaComparableN = 300. Comparing within the same course is what stops a 100-level instructor from
          looking “easier” than a 400-level one.
        </p>
      </FormulaBlock>

      <FormulaBlock
        title="8.4 Rating with Bayesian shrinkage"
        formula={`ratingRaw    = mean(review.quality)                      (null when reviewCount === 0)
priorMean    = mean quality over all reviews in the subject; PRIOR_FALLBACK when the subject has < PRIOR_MIN_REVIEWS
ratingShrunk = (reviewCount × ratingRaw + SHRINK_K × priorMean) / (reviewCount + SHRINK_K)
confidence   = reviewCount < ${CONFIDENCE_THRESHOLDS.medium} → low · ${CONFIDENCE_THRESHOLDS.medium}–${CONFIDENCE_THRESHOLDS.high - 1} → medium · ≥ ${CONFIDENCE_THRESHOLDS.high} → high
wouldTakeAgainPct = 100 × (#true / #non-null)      positiveCount = #quality ≥ 4      criticalCount = #quality ≤ 2`}
        constants={[
          { name: 'SHRINK_K', value: SHRINK_K },
          { name: 'PRIOR_FALLBACK', value: PRIOR_FALLBACK },
          { name: 'PRIOR_MIN_REVIEWS', value: PRIOR_MIN_REVIEWS },
          { name: 'MIN_REVIEWS_RANKED', value: MIN_REVIEWS_RANKED },
        ]}
      >
        <p>
          <strong>Worked example:</strong> three 5-star reviews with a subject prior of 3.7: (3×5 + 5×3.7) / 8 = 4.19, not
          5.0. Thirty 5-star reviews: (30×5 + 5×3.7) / 35 = 4.81. Professors with fewer than {MIN_REVIEWS_RANKED} reviews are
          listed under “Not enough reviews yet” instead of being ranked.
        </p>
      </FormulaBlock>

      <FormulaBlock
        title="8.5 Composite (“Overall” sort), 0–100"
        formula={`R = (ratingShrunk − 1) / 4                                       // 0..1
G = gpaDelta === null ? 0.5 : clamp((gpaDelta + 0.75) / 1.5, 0, 1)   // −0.75 → 0, 0 → 0.5, +0.75 → 1
W = wouldTakeAgainPct === null ? 0.5 : wouldTakeAgainPct / 100
composite = round1(100 × (${COMPOSITE_WEIGHTS.rating}·R + ${COMPOSITE_WEIGHTS.grades}·G + ${COMPOSITE_WEIGHTS.wouldTakeAgain}·W))   // null when ratingShrunk is null`}
      >
        <p>
          <strong>Worked example:</strong> ratingShrunk 4.2, gpaDelta +0.15, would-take-again 80 %: R = 0.80, G = 0.60, W =
          0.80 → 100 × (0.48 + 0.15 + 0.12) = 75.0. Missing inputs substitute a fixed neutral 0.5; weights are never
          renormalized, so every row has the same definition.
        </p>
      </FormulaBlock>

      <FormulaBlock
        title="8.6 Sort keys (all stable; final tie-break lastName, firstName)"
        formula={`rating   (default): ratingShrunk desc → reviewCount desc → gpaDelta desc (nulls last)
overall           : composite desc → ratingShrunk desc
gpa ("Grades")    : gpaDelta desc (nulls last) → gpaMean desc (nulls last) → ratingShrunk desc
reviews           : reviewCount desc → ratingShrunk desc`}
      />

      <FormulaBlock
        title="8.11 Badge thresholds"
        formula={`MIN_BADGE_N = ${MIN_BADGE_N}   (students in the comparison group needed before a grade badge can be awarded)
subjectWRate = Σ W / Σ students over all headline, in-window, non-suppressed rows in the subject`}
      >
        <p>The rule for each badge is listed in the Badges section below.</p>
      </FormulaBlock>
    </>
  );
}

export default ScoringSection;
