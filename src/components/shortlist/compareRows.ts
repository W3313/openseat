// Pure helpers for the compare table (SPEC 3.5): which numeric rows exist, which direction is "best",
// and which column wins each row. Kept free of React so the highlight rule is unit-testable.
import type { ProfessorDetail } from "@/lib/domain/types";

export type BestDirection = "high" | "low";

export interface NumericRowDef {
  key: "rating" | "reviews" | "wouldTakeAgain" | "difficulty" | "gpa" | "delta" | "wRate" | "openSections";
  label: string;
  direction: BestDirection;
  value(detail: ProfessorDetail): number | null;
}

export const NUMERIC_ROWS: readonly NumericRowDef[] = [
  { key: "rating", label: "Rating", direction: "high", value: (d) => d.scores.ratingShrunk },
  { key: "reviews", label: "Reviews", direction: "high", value: (d) => d.scores.reviewCount },
  { key: "wouldTakeAgain", label: "Would take again", direction: "high", value: (d) => d.scores.wouldTakeAgainPct },
  { key: "difficulty", label: "Difficulty", direction: "low", value: (d) => d.scores.difficultyMean },
  { key: "gpa", label: "GPA", direction: "high", value: (d) => d.scores.gpaMean },
  { key: "delta", label: "Δ vs course", direction: "high", value: (d) => d.scores.gpaDelta },
  { key: "wRate", label: "W rate", direction: "low", value: (d) => d.scores.wRate },
  { key: "openSections", label: "Open sections", direction: "high", value: (d) => openSectionCount(d) },
];

/** Rows that only exist when a school has reviews (design §5: hidden on grades-only schools). */
export const REVIEW_ROW_KEYS: ReadonlySet<NumericRowDef["key"]> = new Set(["rating", "reviews", "wouldTakeAgain", "difficulty"]);

/** The numeric rows to render for a school. */
export function numericRowsFor(reviewsAvailable: boolean): NumericRowDef[] {
  return reviewsAvailable ? [...NUMERIC_ROWS] : NUMERIC_ROWS.filter((r) => !REVIEW_ROW_KEYS.has(r.key));
}

export function openSectionCount(detail: Pick<ProfessorDetail, "sections">): number {
  return detail.sections.filter((s) => s.isOpen).length;
}

/**
 * Indexes of the best value(s) in a row. Nulls never win; ties all win; a row with a single non-null
 * value (or none) highlights nothing — there is nothing to compare against.
 */
export function bestIndexes(values: readonly (number | null)[], direction: BestDirection): number[] {
  const present = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v));
  if (present.length < 2) return [];
  const best = present.reduce((acc, x) => (direction === "high" ? Math.max(acc, x.v) : Math.min(acc, x.v)), present[0].v);
  const winners = present.filter((x) => x.v === best).map((x) => x.i);
  return winners.length === present.length ? [] : winners; // everyone equal → no highlight
}

/** Keep the first `max` slugs' details in the order the URL listed them; unknown slugs are dropped. */
export function orderBySlugs(details: readonly (ProfessorDetail | null)[], slugs: readonly string[], max = 3): ProfessorDetail[] {
  const out: ProfessorDetail[] = [];
  for (const slug of slugs) {
    const d = details.find((x) => x?.professor.slug === slug);
    if (d && !out.includes(d)) out.push(d);
    if (out.length >= max) break;
  }
  return out;
}
