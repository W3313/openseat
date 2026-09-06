// SPEC 9.6 step 4 — the grading note is ALWAYS generated here from grade data. The model never sees
// grade numbers, so a hallucinated GPA can never reach the UI.
import type { ProfessorScores } from '@/lib/domain/types';

export const NO_GRADE_DATA_NOTE = 'No grade data linked yet.';

function plural(n: number, word: string): string {
  return `${n} ${word}(s)`;
}

function fmtGpa(value: number): string {
  return value.toFixed(2);
}

/** "+0.31" / "−0.09" with a true minus sign (U+2212), 2 decimals. */
export function formatSignedDelta(delta: number): string {
  const rounded = Math.round(Math.abs(delta) * 100) / 100;
  const sign = delta < 0 && rounded !== 0 ? '−' : '+';
  return `${sign}${rounded.toFixed(2)}`;
}

function fmtWRate(wRate: number | null): string {
  const pct = (wRate ?? 0) * 100;
  return `${pct.toFixed(1)}%`;
}

/**
 * Three cases:
 *  - grade data with a comparison group → "In N course(s) over Y year(s), GPA averaged 3.08 (−0.09 vs. the same
 *    courses taught by others); 1.1% withdrew."
 *  - grade data, no comparison group (gpaDelta null) → "… GPA averaged 3.63; no comparison group in the window."
 *  - no grade data (gpaMean null) → "No grade data linked yet."
 */
export function gradingNote(scores: ProfessorScores, courseCount: number): string {
  if (scores.gpaMean === null) return NO_GRADE_DATA_NOTE;
  const head = `In ${plural(courseCount, 'course')} over ${plural(scores.yearsActive, 'year')}, GPA averaged ${fmtGpa(scores.gpaMean)}`;
  if (scores.gpaDelta === null) return `${head}; no comparison group in the window.`;
  return `${head} (${formatSignedDelta(scores.gpaDelta)} vs. the same courses taught by others); ${fmtWRate(scores.wRate)} withdrew.`;
}
