import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UCSB, UCSB_SUBJECTS } from '@/lib/config/schools/ucsb';
import { SCHOOL_ID_RE } from '@/lib/config/schools/types';
import { parseName } from '@/lib/matching';
import { registeredAdapterKinds } from '@/lib/sources/registry';
import '@/lib/sources/ucsb/register';
import { parseUcsbCourseId, subjectKey, subjectSpelling, UCSB_SUBJECT_SPELLINGS } from '@/lib/sources/ucsb/courseId';
import { isJunkInstructor, parseUcsbInstructor, parseUcsbInstructors, titleCaseSurname, toCommaForm } from '@/lib/sources/ucsb/instructor';
import { quarterCodeToTerm, termFromQuarterWord, termToQuarterCode } from '@/lib/sources/ucsb/quarter';
import {
  COURSE_GRADES_COLUMNS, EXCLUDED_GRADE_CODES, UcsbCsvRowError, UcsbCsvSchemaError, parseCourseGradesCsv, validateCourseGradesHeader,
} from '@/lib/sources/ucsb/parseCourseGrades';
import { UcsbGradesSource } from '@/lib/sources/ucsb/UcsbGradesSource';
import {
  type CurriculumsPage, isPrimarySection, parseCurriculumsClasses, parseCurriculumsClock, parseCurriculumsDays, sectionStatusCode,
} from '@/lib/sources/ucsb/parseCurriculums';
import { UcsbCurriculumsSource } from '@/lib/sources/ucsb/UcsbCurriculumsSource';
import { rankSubjects } from '../../scripts/fetch-ucsb';

const fx = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name);
const CSV = readFileSync(fx('ucsb-course-grades-sample.csv'), 'utf8');
const PAGE = JSON.parse(readFileSync(fx('ucsb-curriculums-CMPSC.json'), 'utf8')) as CurriculumsPage;

describe('ucsb course ids (13-char SSSSSPPPNNNUU)', () => {
  it('splits subject / prefix / number / suffix and folds the prefix into the number', () => {
    expect(parseUcsbCourseId('CMPSC    16  ')).toMatchObject({ subject: 'CMPSC', number: '16', prefix: '', label: 'CMPSC 16' });
    expect(parseUcsbCourseId('PSTATW  120A')).toMatchObject({ subject: 'PSTAT', prefix: 'W', number: 'W120A', label: 'PSTAT W120A' });
    expect(parseUcsbCourseId('ES   1-  99')).toMatchObject({ subject: 'ES', prefix: '1-', number: '1-99' });
    expect(parseUcsbCourseId('CMPSCCS 130H')).toMatchObject({ subject: 'CMPSC', number: 'CS130H' });
    expect(parseUcsbCourseId('POL S     7')).toMatchObject({ subject: 'POLS', subjectRaw: 'POL S', number: '7', label: 'POL S 7' });
    expect(parseUcsbCourseId('CH E    140A ')).toMatchObject({ subject: 'CHE', number: '140A' });
    expect(parseUcsbCourseId('W&L     101')).toMatchObject({ subject: 'WL', number: '101' });
  });
  it('rejects non-ids', () => {
    expect(parseUcsbCourseId('')).toBeNull();
    expect(parseUcsbCourseId('CMPSC   ABC')).toBeNull();
    expect(parseUcsbCourseId('CMPSC        16 extra')).toBeNull();
  });
  it('subject keys satisfy the API subject regex and round-trip to the Registrar spelling', () => {
    for (const [key, spelling] of Object.entries(UCSB_SUBJECT_SPELLINGS)) {
      expect(key).toMatch(/^[A-Z]{2,5}$/);
      expect(subjectKey(spelling)).toBe(key);
      expect(subjectSpelling(key)).toBe(spelling);
    }
    expect(subjectSpelling('cmpsc')).toBe('CMPSC');
  });
});

describe('ucsb instructors ("LAST F M" → "Last, F M")', () => {
  it('parses surname + initials, title-cases and yields the comma form the matcher understands', () => {
    expect(parseUcsbInstructor('DEAN C W')).toEqual({ lastName: 'Dean', initials: ['C', 'W'], raw: 'Dean, C W' });
    expect(toCommaForm('BROWNING R')).toBe('Browning, R');
    expect(toCommaForm('VAN DER VEN A')).toBe('Van Der Ven, A');
    expect(toCommaForm('EL ABBADI A')).toBe('El Abbadi, A');
    expect(toCommaForm("O'CONNOR M I")).toBe("O'Connor, M I");
    expect(toCommaForm('MCHUGH P')).toBe('McHugh, P');
    expect(toCommaForm('SALTZMAN-LI K')).toBe('Saltzman-Li, K');
    expect(toCommaForm('ST. ANDREWS J')).toBe('St. Andrews, J');
  });
  it('splits hyphenated initials and keeps truncated surnames', () => {
    expect(parseUcsbInstructor('FOUQUE J-P')).toMatchObject({ initials: ['J', 'P'], raw: 'Fouque, J P' });
    expect(parseUcsbInstructor('NGUYEN H-A T')).toMatchObject({ initials: ['H', 'A', 'T'] });
    expect(toCommaForm('MARQUES-PASCU')).toBe('Marques-Pascu');
    expect(toCommaForm('  BUENO CACHADI  ')).toBe('Bueno Cachadi');
  });
  it('treats letter-less strings as junk (unattributed) and keeps initials-only strings', () => {
    expect(isJunkInstructor('0')).toBe(true);
    expect(toCommaForm('0')).toBe('');
    expect(toCommaForm('')).toBe('');
    expect(toCommaForm('O M')).toBe('O, M');
    expect(titleCaseSurname('DE LA CRUZ')).toBe('De La Cruz');
  });
  it('handles multi-instructor cells (defensive) with dedupe', () => {
    expect(parseUcsbInstructors('DEAN C W / BROWNING R; DEAN C W')).toEqual(['Dean, C W', 'Browning, R']);
    expect(parseUcsbInstructors('0')).toEqual([]);
  });
  it('produces NameKeys the matcher can use at the initial tier', () => {
    const key = parseName(toCommaForm('DEAN C W'));
    expect(key).toMatchObject({ last: 'dean', firstToken: 'c', firstInitial: 'c', middleInitials: ['w'] });
    expect(parseName(toCommaForm('VAN DER VEN A'))).toMatchObject({ lastCompact: 'vanderven', firstInitial: 'a' });
  });
});

describe('ucsb quarter codes', () => {
  it('maps YYYYQ (1 winter · 2 spring · 3 summer · 4 fall) both ways', () => {
    expect(termToQuarterCode('2026-fa')).toBe('20264');
    expect(termToQuarterCode('2026-wi')).toBe('20261');
    expect(termToQuarterCode('2025-sp')).toBe('20252');
    expect(termToQuarterCode('2025-su')).toBe('20253');
    expect(quarterCodeToTerm('20264')).toBe('2026-fa');
    expect(quarterCodeToTerm('20261')).toBe('2026-wi');
    expect(quarterCodeToTerm('20265')).toBeNull();
    expect(quarterCodeToTerm('2026')).toBeNull();
  });
  it('maps the CSV quarter word + calendar year', () => {
    expect(termFromQuarterWord('Fall', 2025)).toBe('2025-fa');
    expect(termFromQuarterWord('Winter', 2026)).toBe('2026-wi');
    expect(termFromQuarterWord('Spring', 2026)).toBe('2026-sp');
    expect(termFromQuarterWord('Summer', 2025)).toBe('2025-su');
    expect(termFromQuarterWord('Autumn', 2025)).toBe('2025-fa');
    expect(termFromQuarterWord('Q5', 2025)).toBeNull();
    expect(termFromQuarterWord('Fall', 0)).toBeNull();
  });
});

describe('ucsb grades CSV header validation', () => {
  it('has the exact 25 upstream columns', () => {
    expect(COURSE_GRADES_COLUMNS).toHaveLength(25);
    expect(CSV.split('\n')[0]).toBe(COURSE_GRADES_COLUMNS.join(','));
  });
  it('names the missing column', () => {
    expect(() => parseCourseGradesCsv(CSV.replace('nLetterStudents', 'nStudents'))).toThrowError(UcsbCsvSchemaError);
    expect(() => parseCourseGradesCsv(CSV.replace('nLetterStudents', 'nStudents'))).toThrowError(/"nLetterStudents"/);
    expect(() => parseCourseGradesCsv('')).toThrowError(UcsbCsvSchemaError);
    expect(validateCourseGradesHeader([...COURSE_GRADES_COLUMNS, 'Extra'])).toEqual(['Extra']);
  });
  it('rejects a non-numeric count with the line number', () => {
    const lines = CSV.split('\n');
    lines[2] = lines[2].replace(/,Spring,2026,\d+/, ',Spring,2026,x');
    expect(() => parseCourseGradesCsv(lines.join('\n'))).toThrowError(UcsbCsvRowError);
    expect(() => parseCourseGradesCsv(lines.join('\n'))).toThrowError(/line 3/);
  });
});

describe('ucsb grades CSV rows', () => {
  const result = parseCourseGradesCsv(CSV);
  const byKey = (subject: string, number: string) => result.rows.filter((r) => r.subject === subject && r.number === number);

  it('emits every letter-graded row and drops P/NP- or S/U-only rows', () => {
    const total = CSV.split('\n').filter(Boolean).length - 1;
    expect(total).toBe(201);
    expect(result.malformedRows).toBe(0);
    expect(result.lettersMismatch).toBe(0);
    expect(result.rows.length + result.droppedRows).toBe(total);
    expect(result.droppedRows).toBeGreaterThan(5);
    for (const r of result.rows) expect(r.students).toBeGreaterThan(0);
  });
  it('maps Ap/A/Am … Dm/F to the plus-minus buckets with w = 0 and keeps avgGPA as sourceGpa', () => {
    const row = byKey('PSTAT', '231')[0];
    expect(row).toBeDefined();
    expect(row.buckets).toEqual({ aPlus: 2, a: 9, aMinus: 6, bPlus: 1, b: 2, bMinus: 0, cPlus: 0, c: 0, cMinus: 1, dPlus: 0, d: 0, dMinus: 0, f: 1, w: 0 });
    expect(row.students).toBe(22);
    expect(row.sourceGpa).toBeCloseTo(3.509, 3);
    expect(row.yearTerm).toBe('2026-sp');
    expect(row.term).toBe('Spring');
    expect(row.year).toBe(2026);
    expect(row.instructorRaw).toBe('Okonkwo, D');
    expect(row.schedType).toBe('');
    expect(row.title).toBe('');
  });
  it('counts every excluded code (P, derived NP, S, U from the float `su` column, IP)', () => {
    expect(EXCLUDED_GRADE_CODES).toEqual(['P', 'NP', 'S', 'U', 'IP']);
    const ex = result.excludedGradeCodes;
    for (const code of EXCLUDED_GRADE_CODES) expect(ex[code]).toBeGreaterThan(0);
    // §4 "with counts" = row counts (rows where the code was non-zero), also available per term for window scoping.
    const pRows = CSV.split('\n').slice(1).filter((l) => l.trim() !== '' && Number(l.split(',')[12]) > 0).length;
    expect(ex.P).toBe(pRows);
    expect(Object.values(result.excludedByTerm).reduce((acc, t) => acc + t.P, 0)).toBe(ex.P);
    expect(Object.values(result.droppedByTerm).reduce((a, b) => a + b, 0)).toBe(result.droppedRows);
    // MATH 260R Spring 2026: S=6, su=1.0 → U counts 1
    expect(ex.U).toBeGreaterThanOrEqual(1);
    // a blank `su` cell parses as 0 (present in the fixture)
    expect(CSV.split('\n').some((l) => /,\d+,,\d+,/.test(l))).toBe(true);
  });
  it('parses subject/number from the fixed-width course field (prefix folded into the number)', () => {
    expect(byKey('PSTAT', 'W120A')).toHaveLength(1);
    expect(byKey('POLS', '188').length).toBeGreaterThan(0);
    expect(byKey('CHE', '140A')).toHaveLength(1);
    expect(byKey('WRIT', 'W6R')).toHaveLength(1);
    for (const r of result.rows) expect(r.subject).toMatch(/^[A-Z]{2,5}$/);
  });
  it('rewrites instructors into the comma form and blanks junk strings', () => {
    expect(result.rows.filter((r) => r.instructorRaw === '')).toHaveLength(1); // the "0" instructor row
    expect(result.rows.some((r) => r.instructorRaw === 'Liu, F K')).toBe(true);
    expect(result.rows.some((r) => r.instructorRaw === 'Bellweather-T')).toBe(true); // truncated hyphenated surname, no initials
    expect(result.rows.some((r) => r.instructorRaw.startsWith('Van Der '))).toBe(true);
    for (const r of result.rows) expect(r.instructorRaw).not.toMatch(/[A-Z]{3,}/);
  });
});

describe('UcsbGradesSource', () => {
  it('reads the cached CSV, filters to the grade window and returns the §4 extras', async () => {
    const log = { info: () => {}, warn: () => {} };
    const source = new UcsbGradesSource({ currentTerm: '2026-fa', yearsBack: 6, csvPath: fx('ucsb-course-grades-sample.csv'), log });
    const got = await source.fetch({ schoolId: 'ucsb' });
    expect(got.rows.length).toBeGreaterThan(150);
    expect(got.rows.every((r) => r.year >= 2020)).toBe(true);
    expect(got.rows.some((r) => r.yearTerm === '2012-su')).toBe(false);
    expect(got.droppedRows).toBeGreaterThan(0);
    expect(got.excludedGradeCodes.P).toBeGreaterThan(0);
    expect(got.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(source.info).toMatchObject({ id: 'ucsb-daily-nexus-csv', license: null });
    await expect(source.fetch({ schoolId: 'uiuc' })).rejects.toThrow(/only serves school "ucsb"/);
  });
  it('fails with a fetch-script hint when the CSV is missing', async () => {
    const source = new UcsbGradesSource({ currentTerm: '2026-fa', yearsBack: 6, csvPath: fx('nope.csv'), log: { info: () => {}, warn: () => {} } });
    await expect(source.fetch({ schoolId: 'ucsb' })).rejects.toThrow(/scripts\/fetch-ucsb\.ts/);
  });
});

describe('ucsb curriculums parsing', () => {
  const courses = parseCurriculumsClasses(PAGE.classes ?? [], { subject: 'CMPSC' });
  const sections = courses.flatMap((c) => c.sections);
  const byCrn = Object.fromEntries(sections.map((s) => [s.crn, s]));

  it('keeps only the requested subject (CCS variant included) and uses enrollCode as the CRN', () => {
    expect(courses.map((c) => `${c.subject} ${c.number}`)).toEqual(['CMPSC 16', 'CMPSC 130A', 'CMPSC CS130H']);
    expect(Object.keys(byCrn).sort()).toEqual(['07807', '07815', '07823', '08003', '08011', '08029']);
    expect(byCrn['07807']).toMatchObject({ subject: 'CMPSC', number: '16', sectionCode: '0100', statusCode: 'A', seatsKnown: false });
  });
  it('parses instructors into the comma form, trimming, deduping and dropping junk', () => {
    expect(byCrn['07807'].instructorsRaw).toEqual(['Jarosz, T']);
    expect(byCrn['07815'].instructorsRaw).toEqual(['Jarosz, T', 'Okonkwo, D M']);
    expect(byCrn['08011'].instructorsRaw).toEqual(['Ishikawa, Q X', 'Liu, F K']);
    expect(byCrn['07823'].instructorsRaw).toEqual([]);
    expect(byCrn['08029'].instructorsRaw).toEqual([]);
  });
  it('maps meetings: padded day strings, HH:mm clocks, primary vs secondary type, arranged placeholder', () => {
    expect(byCrn['07807'].meetings).toEqual([{ days: ['M', 'W', 'F'], start: '09:00', end: '09:50', building: 'BUCHN', room: '1701', type: 'LEC' }]);
    expect(byCrn['07815'].meetings[0]).toMatchObject({ days: ['T'], start: '14:00', type: 'DIS' });
    expect(byCrn['07823'].meetings[0]).toMatchObject({ days: ['R'], start: '09:00', end: '09:50' });
    expect(byCrn['08003'].meetings).toEqual([{ days: [], start: null, end: null, building: null, room: null, type: 'LEC' }]);
    expect(byCrn['08011'].meetings[0]).toMatchObject({ days: [], start: null, building: null, room: null });
    expect(parseCurriculumsDays(' T R   ')).toEqual(['T', 'R']);
    expect(parseCurriculumsClock('25:00')).toBeNull();
    expect(isPrimarySection('0200')).toBe(true);
    expect(isPrimarySection('0201')).toBe(false);
  });
  it('status: cancelled → inactive; without seats every other section is offered; with seats open/closed', () => {
    expect(byCrn['08003'].statusCode).toBe('cancelled');
    expect(byCrn['07815'].statusCode).toBe('A');
    const seat = Object.fromEntries(parseCurriculumsClasses(PAGE.classes ?? [], { subject: 'CMPSC', seats: true }).flatMap((c) => c.sections).map((s) => [s.crn, s]));
    expect(seat['07807']).toMatchObject({ statusCode: 'open', seatsKnown: true });
    expect(seat['07815']).toMatchObject({ statusCode: 'closed', seatsKnown: true });
    expect(seat['08011']).toMatchObject({ statusCode: 'A', seatsKnown: false });
    expect(sectionStatusCode({ enrolledTotal: 40, maxEnroll: 40 }, true)).toBe('closed');
  });
});

describe('UcsbCurriculumsSource', () => {
  const log = { info: () => {}, warn: () => {} };
  it('is a no-op without a key: no requests, fetchedAt "" (ingest treats the school as grades-only)', async () => {
    let calls = 0;
    const source = new UcsbCurriculumsSource({ useCache: false, log, fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } });
    expect(source.enabled).toBe(false);
    const got = await source.fetchSections({ schoolId: 'ucsb', term: '2026-fa', subject: 'CMPSC' });
    expect(got).toEqual({ term: '2026-fa', fetchedAt: '', sections: [] });
    expect(calls).toBe(0);
  });
  it('with a key: sends ucsb-api-key, the YYYYQ quarter and the Registrar subject spelling, and paginates', async () => {
    const urls: string[] = [];
    let header: string | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      header = (init?.headers as Record<string, string>)['ucsb-api-key'];
      const page = Number(/pageNumber=(\d+)/.exec(url)?.[1]);
      const body: CurriculumsPage = page === 1
        ? { pageNumber: 1, pageSize: 2, total: 3, classes: PAGE.classes!.slice(0, 2) }
        : { pageNumber: 2, pageSize: 2, total: 3, classes: PAGE.classes!.slice(2, 3) };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const source = new UcsbCurriculumsSource({ apiKey: 'k', useCache: false, pageSize: 2, delayMs: 0, log, fetchImpl, now: () => new Date('2026-09-06T00:00:00Z') });
    const got = await source.fetchSections({ schoolId: 'ucsb', term: '2026-fa', subject: 'POLS' });
    expect(header).toBe('k');
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/classes/search?quarter=20264&subjectCode=POL%20S&pageNumber=1&pageSize=2');
    expect(got.fetchedAt).toBe('2026-09-06T00:00:00.000Z');
    expect(got.sections).toEqual([]); // fixture classes are CMPSC, filtered out for POLS
    const cmpsc = new UcsbCurriculumsSource({ apiKey: 'k', useCache: false, pageSize: 2, delayMs: 0, log, fetchImpl });
    expect((await cmpsc.fetchSections({ schoolId: 'ucsb', term: '2026-fa', subject: 'CMPSC' })).sections).toHaveLength(6);
  });
  it('fails fast on a rejected key and retries 5xx', async () => {
    const bad = new UcsbCurriculumsSource({ apiKey: 'k', useCache: false, delayMs: 0, log, fetchImpl: async () => new Response('{"fault":{}}', { status: 401 }) });
    await expect(bad.fetchSections({ schoolId: 'ucsb', term: '2026-fa', subject: 'CMPSC' })).rejects.toThrow(/UCSB_API_KEY/);
    let n = 0;
    const flaky = new UcsbCurriculumsSource({
      apiKey: 'k', useCache: false, delayMs: 0, log, sleep: async () => {},
      fetchImpl: async () => (n++ === 0 ? new Response('', { status: 503 }) : new Response(JSON.stringify(PAGE), { status: 200 })),
    });
    const got = await flaky.fetchSections({ schoolId: 'ucsb', term: '2026-fa', subject: 'CMPSC' });
    expect(got.sections).toHaveLength(6);
    expect(flaky.stats.retries).toBe(1);
  });
});

describe('ucsb registry + config', () => {
  it('registers both adapter kinds named in the SchoolConfig', () => {
    const kinds = registeredAdapterKinds();
    expect(kinds.grades).toContain('ucsb-daily-nexus-csv');
    expect(kinds.schedule).toContain('ucsb-curriculums');
    expect(UCSB.sources.grades.kind).toBe('ucsb-daily-nexus-csv');
    expect(UCSB.sources.schedule?.kind).toBe('ucsb-curriculums');
  });
  it('is a live, grades-only-by-default school with a 20-subject allowlist and truthful attribution', () => {
    expect(UCSB.id).toMatch(SCHOOL_ID_RE);
    expect(UCSB).toMatchObject({ mode: 'live', seatStatusAvailable: false, gradeBuckets: 'plus-minus', gradeValueKind: 'counts', timezone: 'America/Los_Angeles' });
    expect(UCSB.sources.reviews).toBeNull();
    expect(UCSB_SUBJECTS).toHaveLength(20);
    expect(new Set(UCSB_SUBJECTS).size).toBe(20);
    for (const s of UCSB_SUBJECTS) expect(s).toMatch(/^[A-Z]{2,5}$/);
    expect(UCSB.attribution.grades).toMatch(/Daily Nexus/);
    expect(UCSB.attribution.grades).toMatch(/withdrawals are not reported/i);
    expect(UCSB.attribution.schedule).toMatch(/developer\.ucsb\.edu/);
  });
  it('rankSubjects orders the fixture subjects by graded students inside the window', () => {
    const ranked = rankSubjects(parseCourseGradesCsv(CSV).rows, '2026-fa', 6);
    expect(ranked[0].subject).toBe('CHEM');
    expect(ranked.every((s, i) => i === 0 || ranked[i - 1].graded >= s.graded)).toBe(true);
    expect(ranked.find((s) => s.subject === 'MATRL')).toBeUndefined(); // Winter 2014 only
  });
});
