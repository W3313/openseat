// Purdue term codecs. Banner "Academic Period" codes are fiscal-year based: 202610 = Fall 2025,
// 202613 = Winter 2025 (Dec 2025 – Jan 2026), 202620 = Spring 2026, 202630 = Summer 2026. purdue.io
// uses the same codes (Terms.Code) and the same names ("Fall 2025").
import type { Season, TermCode } from '@/lib/domain/types';
import { makeTermCode, parseSeasonWord, termSeason, termYear } from '@/lib/utils/term';

const SUFFIX_TO_SEASON: Readonly<Record<string, { season: Season; yearOffset: number }>> = {
  '10': { season: 'fa', yearOffset: -1 },
  '13': { season: 'wi', yearOffset: 0 },   // Winter 2025 = 202613 → our 2026-wi (it precedes Spring 2026)
  '20': { season: 'sp', yearOffset: 0 },
  '30': { season: 'su', yearOffset: 0 },
};

/** "202610" → "2025-fa"; "202613" → "2026-wi"; null for anything else. */
export function termFromPurdueCode(code: string | number): TermCode | null {
  const m = /^(\d{4})(10|13|20|30)$/.exec(String(code).trim());
  if (!m) return null;
  const rule = SUFFIX_TO_SEASON[m[2]];
  return makeTermCode(Number(m[1]) + rule.yearOffset, rule.season);
}

/** "2025-fa" → "202610"; "2026-wi" → "202613". */
export function purdueCodeFromTerm(term: TermCode): string {
  const y = termYear(term);
  switch (termSeason(term)) {
    case 'fa': return `${y + 1}10`;
    case 'wi': return `${y}13`;
    case 'sp': return `${y}20`;
    case 'su': return `${y}30`;
  }
}

/**
 * "Fall 2025" → "2025-fa"; "Winter 2025" → "2026-wi" (Purdue names the Dec–Jan session after the year it
 * starts in; our ordinal puts it just before that year's spring). null when unparsable.
 */
export function termFromPurdueName(name: string): TermCode | null {
  const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(name);
  if (!m) return null;
  const season = parseSeasonWord(m[1]);
  if (!season) return null;
  const year = Number(m[2]);
  return makeTermCode(season === 'wi' ? year + 1 : year, season);
}

/** Purdue's own display name for a term ("Fall 2025", "Winter 2025" for our 2026-wi). */
export function purdueTermName(term: TermCode): string {
  const season = termSeason(term);
  const year = termYear(term) - (season === 'wi' ? 1 : 0);
  const word = { fa: 'Fall', sp: 'Spring', su: 'Summer', wi: 'Winter' }[season];
  return `${word} ${year}`;
}
