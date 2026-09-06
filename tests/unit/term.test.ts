// SPEC 12.3: round-trips 2026-fa ↔ {2026,'fall'} ↔ "Fall 2026" ↔ CSV "Fall"; ordinal math; term end dates.
import { describe, expect, it } from 'vitest';
import type { TermCode } from '@/lib/domain/types';
import {
  SEASONS,
  assertTermCode,
  compareTerms,
  gradeWindowStartOrdinal,
  gradeWindowStartTerm,
  inGradeWindow,
  isTermCode,
  makeTermCode,
  maxTerm,
  ordinalOf,
  parseSeasonWord,
  parseTermCode,
  parseTermDisplay,
  termDisplay,
  termEndDate,
  termEndDateISO,
  termFromCsv,
  termFromExplorerParts,
  termFromExplorerPath,
  termFromOrdinal,
  termHasEnded,
  termOrdinal,
  termToCsvWord,
  termToExplorerParts,
  termToExplorerPath,
} from '@/lib/utils/term';

describe('term codec', () => {
  it('parses and validates TermCodes', () => {
    expect(parseTermCode('2026-fa')).toEqual({ year: 2026, season: 'fa' });
    expect(parseTermCode(' 2025-sp ')).toEqual({ year: 2025, season: 'sp' });
    expect(parseTermCode('2026-xx')).toBeNull();
    expect(parseTermCode('26-fa')).toBeNull();
    expect(isTermCode('2026-fa')).toBe(true);
    expect(isTermCode('Fall 2026')).toBe(false);
    expect(isTermCode(2026)).toBe(false);
    expect(assertTermCode('2026-fa', 'CURRENT_TERM')).toBe('2026-fa');
    expect(() => assertTermCode('fall', 'CURRENT_TERM')).toThrow(/Invalid CURRENT_TERM/);
    expect(() => makeTermCode(99, 'fa')).toThrow(/Invalid term year/);
  });

  it('round-trips with the Course Explorer parts and path', () => {
    expect(termToExplorerParts('2026-fa')).toEqual({ year: 2026, season: 'fall' });
    expect(termToExplorerPath('2026-fa')).toBe('2026/fall');
    expect(termFromExplorerParts(2026, 'fall')).toBe('2026-fa');
    expect(termFromExplorerParts('2026', 'Fall')).toBe('2026-fa');
    expect(termFromExplorerParts('2026', 'monsoon')).toBeNull();
    expect(termFromExplorerPath('2026/fall')).toBe('2026-fa');
    expect(termFromExplorerPath('/2026/fall/')).toBe('2026-fa');
    expect(termFromExplorerPath('https://courses.illinois.edu/cisapp/explorer/schedule/2026/fall/CS.xml')).toBe('2026-fa');
    expect(termFromExplorerPath('schedule/2026.xml')).toBeNull();
    for (const season of SEASONS) {
      const code = makeTermCode(2024, season);
      const p = termToExplorerParts(code);
      expect(termFromExplorerParts(p.year, p.season)).toBe(code);
    }
  });

  it('round-trips with the display string "Fall 2026"', () => {
    expect(termDisplay('2026-fa')).toBe('Fall 2026');
    expect(termDisplay('2025-wi')).toBe('Winter 2025');
    expect(parseTermDisplay('Fall 2026')).toBe('2026-fa');
    expect(parseTermDisplay('  fall   2026 ')).toBe('2026-fa');
    expect(parseTermDisplay('2026 Fall')).toBe('2026-fa');
    expect(parseTermDisplay('Fall')).toBeNull();
    expect(parseTermDisplay('Fall 26')).toBeNull();
    expect(parseTermDisplay('Monsoon 2026')).toBeNull();
    for (const season of SEASONS) {
      const code = makeTermCode(2023, season);
      expect(parseTermDisplay(termDisplay(code))).toBe(code);
    }
  });

  it('round-trips with the CSV Year + Term columns', () => {
    expect(termFromCsv(2025, 'Fall')).toBe('2025-fa');
    expect(termFromCsv('2025', 'Spring')).toBe('2025-sp');
    expect(termFromCsv(2025, 'summer')).toBe('2025-su');
    expect(termFromCsv(2025, 'Winter')).toBe('2025-wi');
    expect(() => termFromCsv(2025, 'Monsoon')).toThrow(/Unknown term word/);
    expect(termToCsvWord('2025-fa')).toBe('Fall');
    expect(termToCsvWord('2025-wi')).toBe('Winter');
    for (const season of SEASONS) {
      const code = makeTermCode(2022, season);
      expect(termFromCsv(2022, termToCsvWord(code))).toBe(code);
    }
    expect(parseSeasonWord('FA')).toBe('fa');
    expect(parseSeasonWord('Autumn')).toBe('fa');
    expect(parseSeasonWord('')).toBeNull();
  });

  it('computes ordinals as year*10 + season index', () => {
    expect(ordinalOf(2026, 'wi')).toBe(20260);
    expect(ordinalOf(2026, 'sp')).toBe(20261);
    expect(ordinalOf(2026, 'su')).toBe(20262);
    expect(ordinalOf(2026, 'fa')).toBe(20263);
    expect(termOrdinal('2026-fa')).toBe(20263);
    expect(termFromOrdinal(20263)).toBe('2026-fa');
    expect(termFromOrdinal(20200)).toBe('2020-wi');
    expect(() => termFromOrdinal(20265)).toThrow(/Not a term ordinal/);
    expect(() => termFromOrdinal(20263.5)).toThrow(/Not a term ordinal/);
    expect(compareTerms('2026-fa', '2026-sp')).toBeGreaterThan(0);
    expect(compareTerms('2025-fa', '2026-wi')).toBeLessThan(0);
    expect(compareTerms('2026-fa', '2026-fa')).toBe(0);
    const terms: TermCode[] = ['2024-fa', '2026-sp', '2025-wi'];
    expect(maxTerm(terms)).toBe('2026-sp');
    expect(maxTerm([])).toBeNull();
  });

  it('derives the grade window from the ordinal', () => {
    expect(gradeWindowStartOrdinal('2026-fa', 6)).toBe(20263 - 60);
    expect(gradeWindowStartTerm('2026-fa', 6)).toBe('2020-fa');
    expect(inGradeWindow('2020-fa', '2026-fa', 6)).toBe(true); // exactly ordinal − 60 is inside
    expect(inGradeWindow('2020-su', '2026-fa', 6)).toBe(false);
    expect(inGradeWindow('2027-sp', '2026-fa', 6)).toBe(true); // no upper bound
  });

  it('knows when each term ends', () => {
    expect(termEndDateISO('2026-fa')).toBe('2026-12-31');
    expect(termEndDateISO('2026-sp')).toBe('2026-05-31');
    expect(termEndDateISO('2026-su')).toBe('2026-08-15');
    expect(termEndDateISO('2026-wi')).toBe('2026-01-31');
    expect(termEndDate('2026-fa').toISOString()).toBe('2026-12-31T23:59:59.999Z');
    expect(termHasEnded('2026-sp', new Date('2026-06-01T00:00:00Z'))).toBe(true);
    expect(termHasEnded('2026-sp', new Date('2026-05-31T12:00:00Z'))).toBe(false);
    expect(termHasEnded('2026-fa', new Date('2026-09-05T00:00:00Z'))).toBe(false);
  });
});
