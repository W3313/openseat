// SPEC 7.5 — every row of the matching test table (all names fictional) plus memo idempotence (SPEC 12.3).
import { beforeEach, describe, expect, it } from 'vitest';
import type { Professor } from '@/lib/domain/types';
import { gradesOnlySlug } from '@/lib/utils/slug';
import {
  clearMatchMemo, damerauLevenshtein, displayNameFromRaw, matchMemoSize, nameKeyFromFields, nicknameGroup,
  NICKNAME_GROUP_COUNT, normalize, parseName, resolve, resolveRaw, score, buildMatchReport, toReportEntry,
} from '@/lib/matching';
import type { MatchScope, Resolution } from '@/lib/matching';

let seq = 0;
function prof(first: string, last: string, subjects: string[] = ['CS'], courseIds: string[] = [], slug?: string): Professor {
  const s = slug ?? `${first}-${last}-${++seq}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `uiuc:p:${s}`, schoolId: 'uiuc', slug: s, kind: 'reviewed', displayName: `${first} ${last}`,
    firstName: first, lastName: last, nameKey: nameKeyFromFields(first, last), department: null,
    subjects, courseIds, nameVariants: [], reviewSourceId: null, isFictional: true,
  };
}
const grades = (subject = 'CS', extra: Partial<MatchScope> = {}): MatchScope => ({ schoolId: 'uiuc', source: 'grades', subject, ...extra });
const schedule = (courseIds: string[], subject = 'CS'): MatchScope => ({ schoolId: 'uiuc', source: 'schedule', subject, courseIds });
function key(raw: string) {
  const k = parseName(raw);
  if (!k) throw new Error(`blocked: ${raw}`);
  return k;
}
function run(raw: string, candidates: Professor[], scope: MatchScope = grades()): Resolution {
  return resolve(key(raw), candidates, scope);
}

beforeEach(() => clearMatchMemo());

describe('normalize / parseName (SPEC 7.1–7.2)', () => {
  it('strips diacritics, apostrophes, separators, suffixes and titles', () => {
    expect(normalize("Dr. O'Halloran-Reyes Jr")).toBe('ohalloran reyes');
    expect(normalize('Sigrún Ólafsdóttir')).toBe('sigrun olafsdottir');
    expect(normalize('Sørensen')).toBe('sorensen');
  });
  it('comma form derives every field', () => {
    const k = key('Okonkwo, Adaeze M');
    expect(k).toMatchObject({ last: 'okonkwo', lastCompact: 'okonkwo', first: 'adaeze m', firstToken: 'adaeze', firstInitial: 'a', middleInitials: ['m'] });
  });
  it('#10 no-comma form folds particles into the surname', () => {
    expect(key('Anna van der Berg').last).toBe('van der berg');
    expect(key('Anna van der Berg').first).toBe('anna');
  });
  it('#17 hyphenated first name: firstToken is the first piece, firstCompact joins them', () => {
    const k = key('Kim, Soo-jin');
    expect(k.firstToken).toBe('soo');
    expect(k.firstCompact).toBe('soojin');
  });
  it('#20 blocked strings return null and resolveRaw reports blocked', () => {
    for (const raw of ['Staff', 'TBA', '', '  ', 'tbd', 'Instructor']) expect(parseName(raw)).toBeNull();
    expect(resolveRaw('Staff', [prof('A', 'Staff')], grades())).toMatchObject({ method: 'blocked', professorId: null });
  });
  it('#18 / #27 grades-only slug + display name reconstruction', () => {
    const k = key('Nguyen, T');
    expect(gradesOnlySlug(k.lastCompact, k.firstToken)).toBe('nguyen-t');
    expect(displayNameFromRaw('Nguyen, T').displayName).toBe('T. Nguyen');
    expect(displayNameFromRaw('Okonkwo, J').displayName).toBe('J. Okonkwo');
    expect(displayNameFromRaw('Smith, John Jr').displayName).toBe('John Smith');
    const p = key('Patel');
    expect(p.first).toBe('');
    expect(gradesOnlySlug(p.lastCompact, p.firstToken)).toBe('patel-x');
  });
});

describe('damerauLevenshtein / nicknames', () => {
  it('counts an adjacent transposition as one edit', () => {
    expect(damerauLevenshtein('stienberg', 'steinberg')).toBe(1);
    expect(damerauLevenshtein('smyth', 'smith')).toBe(1);
    expect(damerauLevenshtein('abc', 'abc')).toBe(0);
    expect(damerauLevenshtein('', 'abc')).toBe(3);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
  });
  it('has 25 symmetric groups', () => {
    expect(NICKNAME_GROUP_COUNT).toBe(25);
    expect(nicknameGroup('bob')).toEqual(new Set(['robert', 'rob', 'bob', 'bobby']));
    expect(nicknameGroup('bill')?.has('william')).toBe(true);
    expect(nicknameGroup('zed')).toBeNull();
  });
});

describe('score tiers (SPEC 7.3)', () => {
  const adaeze = prof('Adaeze', 'Okonkwo');
  it('#1 exact', () => expect(score(key('Okonkwo, Adaeze'), adaeze)).toEqual({ score: 1, method: 'exact' }));
  it('#2 first-token with a middle initial', () => expect(score(key('okonkwo,adaeze m'), adaeze)).toEqual({ score: 0.95, method: 'first-token' }));
  it('#3 / #4 initial, period stripped', () => {
    expect(score(key('Okonkwo, A'), adaeze)).toEqual({ score: 0.85, method: 'initial' });
    expect(score(key('Okonkwo, A.'), adaeze)).toEqual({ score: 0.85, method: 'initial' });
  });
  it('#5 nickname', () => expect(score(key('Vantreight, Bill'), prof('William', 'Vantreight')).method).toBe('nickname'));
  it('#6 / #7 hyphen collapses; compound-last on the final token', () => {
    const maria = prof('Maria', 'Garcia Ramirez');
    expect(score(key('Garcia-Ramirez, Maria'), maria)).toEqual({ score: 1, method: 'exact' });
    expect(score(key('Ramirez, Maria'), maria)).toEqual({ score: 0.8, method: 'compound-last' });
  });
  it('#8 / #9 / #10 diacritics, apostrophes, particles', () => {
    expect(score(key('Olafsdottir, Sigrun'), prof('Sigrún', 'Ólafsdóttir')).method).toBe('exact');
    expect(score(key("O'Halloran, Siobhan"), prof('Siobhan', 'OHalloran')).method).toBe('exact');
    expect(score(key('Van Der Berg, Anna'), prof('Anna', 'van der Berg')).method).toBe('exact');
  });
  it('#11 fuzzy needs T1/T2 first-name evidence', () => {
    const eli = prof('Eli', 'Steinberg');
    expect(score(key('Stienberg, Eli'), eli)).toEqual({ score: 0.75, method: 'fuzzy' });
    expect(score(key('Stienberg, E'), eli)).toEqual({ score: 0, method: 'unmatched' });
  });
  it('#14 / #16 / #17 first-token, suffix, hyphenated first initial', () => {
    expect(score(key('Lee, Jane Marie'), prof('Jane', 'Lee')).method).toBe('first-token');
    expect(score(key('Smith, John Jr'), prof('John', 'Smith')).method).toBe('exact');
    expect(score(key('Kim, S'), prof('Soo-jin', 'Kim')).method).toBe('initial');
  });
  it('#19 middle-initial penalty halves the score', () => {
    expect(score(key('Smith, J A'), prof('John B', 'Smith')).score).toBeCloseTo(0.425);
    expect(score(key('Smith, J A'), prof('Jane A', 'Smith')).score).toBe(0.85);
  });
  it('#26 / #27 fuzzy length floor; last-name-only never matches', () => {
    expect(score(key('Smyth, Robert'), prof('Robert', 'Smith'))).toEqual({ score: 0, method: 'unmatched' });
    expect(score(key('Patel'), prof('Priya', 'Patel'))).toEqual({ score: 0, method: 'unmatched' });
  });
});

describe('resolve (SPEC 7.4)', () => {
  it('#1–#3 accept in subject scope and report candidates', () => {
    const adaeze = prof('Adaeze', 'Okonkwo');
    const r = run('Okonkwo, Adaeze', [adaeze, prof('Chidi', 'Okonkwo')]);
    expect(r).toMatchObject({ professorId: adaeze.id, method: 'exact', score: 1 });
    expect(r.candidates[0]).toEqual({ professorId: adaeze.id, score: 1, method: 'exact' });
    expect(run('Okonkwo, A', [adaeze]).method).toBe('initial');
  });
  it('#12 same subject, same initial → ambiguous, becomes lee-j', () => {
    const r = run('Lee, J', [prof('Jane', 'Lee'), prof('John', 'Lee')]);
    expect(r).toMatchObject({ professorId: null, method: 'ambiguous', score: 0.85 });
    expect(r.candidates).toHaveLength(2);
    expect(gradesOnlySlug(key('Lee, J').lastCompact, key('Lee, J').firstToken)).toBe('lee-j');
  });
  it('#13 subject scope excludes the ECE homonym', () => {
    const jane = prof('Jane', 'Lee', ['CS']);
    expect(run('Lee, J', [jane, prof('John', 'Lee', ['ECE'])])).toMatchObject({ professorId: jane.id, method: 'initial' });
  });
  it('#15 two identical names in scope → ambiguous', () => {
    expect(run('Chen, Wei', [prof('Wei', 'Chen'), prof('Wei', 'Chen')]).method).toBe('ambiguous');
  });
  it('#18 no candidate → unmatched with empty candidates', () => {
    expect(run('Nguyen, T', [prof('Priya', 'Patel')])).toEqual({ professorId: null, method: 'unmatched', score: 0, candidates: [] });
  });
  it('#19 middle-initial penalty leaves a clear margin', () => {
    const jane = prof('Jane A', 'Smith');
    expect(run('Smith, J A', [prof('John B', 'Smith'), jane])).toMatchObject({ professorId: jane.id, method: 'initial', score: 0.85 });
  });
  it('#21 alias beats ambiguity', () => {
    const cordelia = prof('Cordelia', 'Vantreight', ['CS'], [], 'cordelia-vantreight');
    const r = run('Vantreight, C', [cordelia, prof('Carl', 'Vantreight')], grades('CS', { aliases: { 'Vantreight, C': 'uiuc:p:cordelia-vantreight' } }));
    expect(r).toMatchObject({ professorId: 'uiuc:p:cordelia-vantreight', method: 'alias', score: 1 });
  });
  it('#22 schedule string trimmed and resolved in course scope', () => {
    const bianca = prof('Bianca', 'Solomon', ['CS'], ['uiuc:CS:225']);
    const ben = prof('Ben', 'Solomon', ['CS'], ['uiuc:CS:374']);
    expect(run(' Solomon, B', [ben, bianca], schedule(['uiuc:CS:225']))).toMatchObject({ professorId: bianca.id, method: 'initial' });
  });
  it('#23 ambiguity in course scope stops the search', () => {
    const r = run('Solomon, B', [prof('Bianca', 'Solomon', ['CS'], ['uiuc:CS:225']), prof('Ben', 'Solomon', ['CS'], ['uiuc:CS:225'])], schedule(['uiuc:CS:225']));
    expect(r.method).toBe('ambiguous');
    expect(r.professorId).toBeNull();
  });
  it('#24 exact match widens to school scope (1.00 ≥ 0.85)', () => {
    const petra = prof('Petra', 'Lindqvist', ['ECE']);
    expect(run('Lindqvist, Petra', [petra])).toMatchObject({ professorId: petra.id, method: 'exact' });
  });
  it('#25 fuzzy accepted in subject scope but not school-wide', () => {
    expect(run('Hollowey, Dana', [prof('Dana', 'Holloway', ['CS'])])).toMatchObject({ method: 'fuzzy', score: 0.75 });
    clearMatchMemo();
    const r = run('Hollowey, Dana', [prof('Dana', 'Holloway', ['ECE'])]);
    expect(r).toMatchObject({ professorId: null, method: 'unmatched' });
    expect(r.candidates[0]?.score).toBe(0.75);
  });
  it('#26 / #27 grades-only fallbacks', () => {
    expect(run('Smyth, Robert', [prof('Robert', 'Smith')]).method).toBe('unmatched');
    expect(run('Patel', [prof('Priya', 'Patel')]).method).toBe('unmatched');
  });
  it('#28 many strings → one professor', () => {
    const william = prof('William', 'Vantreight');
    const methods = ['Vantreight, William', 'Vantreight, Bill', 'Vantreight, W'].map((raw) => run(raw, [william]));
    expect(methods.map((r) => r.method)).toEqual(['exact', 'nickname', 'initial']);
    expect(new Set(methods.map((r) => r.professorId))).toEqual(new Set([william.id]));
  });
  it('#29 determinism: shuffled candidates and repeated strings give identical resolutions (memo)', () => {
    const pool = [prof('Jane A', 'Smith'), prof('John B', 'Smith'), prof('Jon', 'Smith', ['ECE']), prof('Adaeze', 'Okonkwo')];
    const first = run('Smith, J A', pool);
    clearMatchMemo();
    const shuffled = run('Smith, J A', [...pool].reverse());
    expect(shuffled).toEqual(first);
    const before = matchMemoSize();
    const again = run('Smith, J A', []);
    expect(again).toEqual(first);
    expect(matchMemoSize()).toBe(before);
    again.candidates.push({ professorId: 'x', score: 0, method: 'unmatched' });
    expect(run('Smith, J A', []).candidates).toEqual(first.candidates);
  });
  it('memo key includes the scope subject so the same string may resolve differently per subject', () => {
    const jane = prof('Jane', 'Lee', ['CS']);
    const john = prof('John', 'Lee', ['ECE']);
    expect(run('Lee, J', [jane, john], grades('CS')).professorId).toBe(jane.id);
    expect(run('Lee, J', [jane, john], grades('ECE')).professorId).toBe(john.id);
  });
});

describe('match report', () => {
  it('aggregates coverage by method and computes matchRate', () => {
    const adaeze = prof('Adaeze', 'Okonkwo');
    const entries = [
      toReportEntry('Okonkwo, Adaeze', 'grades', 'CS', run('Okonkwo, Adaeze', [adaeze]), 5),
      toReportEntry('Nguyen, T', 'grades', 'CS', run('Nguyen, T', [adaeze]), 2),
      toReportEntry('Lee, J', 'grades', 'CS', run('Lee, J', [prof('Jane', 'Lee'), prof('John', 'Lee')]), 1),
    ];
    const report = buildMatchReport({ entries, blockedCount: 2, sectionsLinked: 3, sectionsTotal: 4, generatedAt: '2026-09-05T00:00:00.000Z' });
    expect(report.coverage).toMatchObject({ distinctStrings: 3, matched: 1, ambiguous: 1, unmatched: 1, blocked: 2, sectionsLinked: 3, sectionsTotal: 4 });
    expect(report.coverage.matchRate).toBeCloseTo(1 / 3);
    expect(report.coverage.byMethod.exact).toBe(1);
    expect(report.entries.map((e) => e.instructorRaw)).toEqual(['Lee, J', 'Nguyen, T', 'Okonkwo, Adaeze']);
  });
});
