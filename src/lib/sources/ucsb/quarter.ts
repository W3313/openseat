// UCSB quarter codes ↔ ProfPeek TermCode. The Curriculums API spells a term as YYYYQ where
// Q = 1 winter · 2 spring · 3 summer · 4 fall (calendar year); the grades CSV spells it as the
// quarter word ("Fall") plus a calendar `year` column. Both map onto the existing Season set.
import type { Season, TermCode } from '@/lib/domain/types';
import { makeTermCode, parseSeasonWord, parseTermCode } from '@/lib/utils/term';

export const QUARTER_DIGIT: Readonly<Record<Season, string>> = Object.freeze({ wi: '1', sp: '2', su: '3', fa: '4' });
const DIGIT_SEASON: Readonly<Record<string, Season>> = Object.freeze({ '1': 'wi', '2': 'sp', '3': 'su', '4': 'fa' });

/** "2026-fa" → "20264". */
export function termToQuarterCode(term: TermCode): string {
  const parts = parseTermCode(term);
  if (!parts) throw new Error(`Invalid term code ${JSON.stringify(term)}`);
  return `${parts.year}${QUARTER_DIGIT[parts.season]}`;
}

/** "20264" → "2026-fa"; null for anything that is not YYYYQ with Q in 1–4. */
export function quarterCodeToTerm(code: string): TermCode | null {
  const m = /^(\d{4})([1-4])$/.exec(code.trim());
  if (!m) return null;
  return makeTermCode(Number(m[1]), DIGIT_SEASON[m[2]]);
}

/** CSV ("Fall", 2025) → "2025-fa"; null when the quarter word or year is unusable. */
export function termFromQuarterWord(quarter: string, year: number): TermCode | null {
  const season = parseSeasonWord(quarter);
  if (!season || !Number.isInteger(year) || year < 1900 || year > 2999) return null;
  return makeTermCode(year, season);
}
