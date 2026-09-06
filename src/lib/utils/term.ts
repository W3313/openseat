// TermCode codec (SPEC 5.1, 6.2, 8.1, risk #18). One place that knows how a term is spelled in every
// source: CSV `YearTerm` "2026-fa" / `Term` "Fall", Course Explorer path "2026/fall" and term text
// "Fall 2026", the UI display "Fall 2026", and the ordinal used for windows and "through" labels.
import type { Season, TermCode } from '@/lib/domain/types';

/** Seasons in chronological order within a calendar year (also the ordinal digit). */
export const SEASONS: readonly Season[] = ['wi', 'sp', 'su', 'fa'];
export const SEASON_ORDINAL: Record<Season, number> = { wi: 0, sp: 1, su: 2, fa: 3 };
export const SEASON_WORD: Record<Season, string> = { wi: 'Winter', sp: 'Spring', su: 'Summer', fa: 'Fall' };
export const SEASON_PATH: Record<Season, string> = { wi: 'winter', sp: 'spring', su: 'summer', fa: 'fall' };
/** Month/day the term is considered over (SPEC 3.2): fa → Dec 31, sp → May 31, su → Aug 15, wi → Jan 31. */
export const SEASON_END: Record<Season, { month: number; day: number }> = {
  fa: { month: 12, day: 31 },
  sp: { month: 5, day: 31 },
  su: { month: 8, day: 15 },
  wi: { month: 1, day: 31 },
};

const WORD_TO_SEASON: Record<string, Season> = {
  wi: 'wi', winter: 'wi',
  sp: 'sp', spring: 'sp',
  su: 'su', summer: 'su',
  fa: 'fa', fall: 'fa', autumn: 'fa',
};

export const TERM_CODE_RE = /^(\d{4})-(wi|sp|su|fa)$/;

export interface TermParts {
  year: number;
  season: Season;
}

export function isSeason(value: unknown): value is Season {
  return typeof value === 'string' && value in SEASON_ORDINAL;
}

/** "Fall" | "fall" | "FA" | "fa" | "Autumn" → 'fa'; null when unknown. */
export function parseSeasonWord(word: string): Season | null {
  return WORD_TO_SEASON[word.trim().toLowerCase()] ?? null;
}

export function parseTermCode(code: string): TermParts | null {
  const m = TERM_CODE_RE.exec(code.trim());
  if (!m) return null;
  return { year: Number(m[1]), season: m[2] as Season };
}

export function isTermCode(value: unknown): value is TermCode {
  return typeof value === 'string' && TERM_CODE_RE.test(value);
}

export function assertTermCode(value: string, context = 'term'): TermCode {
  if (!isTermCode(value)) throw new Error(`Invalid ${context}: "${value}" (expected e.g. 2026-fa)`);
  return value;
}

export function makeTermCode(year: number, season: Season): TermCode {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new Error(`Invalid term year: ${year}`);
  return `${year}-${season}`;
}

export function termYear(code: TermCode): number {
  return Number(code.slice(0, 4));
}

export function termSeason(code: TermCode): Season {
  return code.slice(5) as Season;
}

/** CSV `Year` + `Term` columns → TermCode: (2025, "Fall") → "2025-fa". Throws on an unknown season word. */
export function termFromCsv(year: number | string, termWord: string): TermCode {
  const season = parseSeasonWord(termWord);
  if (!season) throw new Error(`Unknown term word in CSV: "${termWord}"`);
  return makeTermCode(Number(year), season);
}

/** TermCode → CSV `Term` word: "2025-fa" → "Fall". */
export function termToCsvWord(code: TermCode): string {
  return SEASON_WORD[termSeason(code)];
}

/** UI display: "2026-fa" → "Fall 2026". */
export function termDisplay(code: TermCode): string {
  return `${SEASON_WORD[termSeason(code)]} ${termYear(code)}`;
}

/** Inverse of termDisplay, tolerant of case/whitespace and "2026 Fall" order. Used to match Course Explorer `<term>` text. */
export function parseTermDisplay(text: string): TermCode | null {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length !== 2) return null;
  const [a, b] = tokens;
  const yearFirst = /^\d{4}$/.test(a);
  const yearTok = yearFirst ? a : b;
  const seasonTok = yearFirst ? b : a;
  if (!/^\d{4}$/.test(yearTok)) return null;
  const season = parseSeasonWord(seasonTok);
  return season ? makeTermCode(Number(yearTok), season) : null;
}

/** Course Explorer path parts: "2026-fa" → { year: 2026, season: "fall" }. */
export function termToExplorerParts(code: TermCode): { year: number; season: string } {
  return { year: termYear(code), season: SEASON_PATH[termSeason(code)] };
}

export function termFromExplorerParts(year: number | string, season: string): TermCode | null {
  const y = Number(year);
  const s = parseSeasonWord(season);
  if (!Number.isInteger(y) || !s) return null;
  return makeTermCode(y, s);
}

/** "2026-fa" → "2026/fall" (segment used in `{BASE}/{year}/{season}/{SUBJECT}.xml`). */
export function termToExplorerPath(code: TermCode): string {
  const p = termToExplorerParts(code);
  return `${p.year}/${p.season}`;
}

/** "2026/fall", "/2026/fall/" or ".../schedule/2026/fall/CS.xml" → "2026-fa". */
export function termFromExplorerPath(path: string): TermCode | null {
  const m = /(\d{4})\/(winter|spring|summer|fall)(?:\/|\.xml|$)/i.exec(path);
  if (!m) return null;
  return termFromExplorerParts(m[1], m[2]);
}

/** ordinal(y, season) = y * 10 + { wi: 0, sp: 1, su: 2, fa: 3 }[season] (SPEC 5.1). */
export function ordinalOf(year: number, season: Season): number {
  return year * 10 + SEASON_ORDINAL[season];
}

export function termOrdinal(code: TermCode): number {
  return ordinalOf(termYear(code), termSeason(code));
}

/** Inverse of termOrdinal. Throws when the last digit is not a season (4–9). */
export function termFromOrdinal(ordinal: number): TermCode {
  const season = SEASONS[ordinal % 10];
  if (!season || !Number.isInteger(ordinal)) throw new Error(`Not a term ordinal: ${ordinal}`);
  return makeTermCode(Math.floor(ordinal / 10), season);
}

export function compareTerms(a: TermCode, b: TermCode): number {
  return termOrdinal(a) - termOrdinal(b);
}

export function maxTerm(terms: Iterable<TermCode>): TermCode | null {
  let best: TermCode | null = null;
  for (const t of terms) if (best === null || compareTerms(t, best) > 0) best = t;
  return best;
}

/** "YYYY-MM-DD" of the day the term ends (SPEC 3.2 end dates). */
export function termEndDateISO(code: TermCode): string {
  const { month, day } = SEASON_END[termSeason(code)];
  return `${termYear(code)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** End of the term's last day (23:59:59.999 UTC — day granularity is all the UI needs). */
export function termEndDate(code: TermCode): Date {
  const { month, day } = SEASON_END[termSeason(code)];
  return new Date(Date.UTC(termYear(code), month - 1, day, 23, 59, 59, 999));
}

export function termHasEnded(code: TermCode, now: Date = new Date()): boolean {
  return now.getTime() > termEndDate(code).getTime();
}

/** First ordinal inside the grade window: ordinal(currentTerm) − 10 × yearsBack (SPEC 6.2 / 8.1). */
export function gradeWindowStartOrdinal(currentTerm: TermCode, yearsBack: number): number {
  return termOrdinal(currentTerm) - 10 * yearsBack;
}

export function gradeWindowStartTerm(currentTerm: TermCode, yearsBack: number): TermCode {
  return termFromOrdinal(gradeWindowStartOrdinal(currentTerm, yearsBack));
}

/** Inclusive lower bound, no upper bound (rows newer than currentTerm are kept). */
export function inGradeWindow(term: TermCode, currentTerm: TermCode, yearsBack: number): boolean {
  return termOrdinal(term) >= gradeWindowStartOrdinal(currentTerm, yearsBack);
}
