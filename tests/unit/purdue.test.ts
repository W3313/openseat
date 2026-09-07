import { readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseName } from '@/lib/matching';
import { LETTER_BUCKET_KEYS } from '@/lib/domain/constants';
import { PURDUE, PURDUE_SUBJECTS } from '@/lib/config/schools/purdue';
import {
  BoilerGradesSchemaError, HEADERLESS_SCHEMAS, classifyHeader, detectDelimiter, inferHeaderlessColumns, isHeaderRow, mapHeader,
} from '@/lib/sources/purdue/columns';
import {
  CODE_TO_BUCKET, EXCLUDED_CODES, KNOWN_CODES, MIN_LETTER_SHARE_PCT, normalizeGradeCode, parsePercentCell, scalePercentBuckets, sumBuckets,
} from '@/lib/sources/purdue/gradeCodes';
import { parseBoilerGradesCsv } from '@/lib/sources/purdue/parseBoilerGradesCsv';
import { MAX_TINY_COHORT_N, bucketPercentages, convertRows, dedupeByCrn, impliedCohortSize, toRawGradeRow } from '@/lib/sources/purdue/toRawGradeRow';
import { purdueCodeFromTerm, purdueTermName, termFromPurdueCode, termFromPurdueName } from '@/lib/sources/purdue/terms';
import {
  addMinutes, meetingTypeCode, parseDaysOfWeek, parseDurationMinutes, parseSectionsJson, parseStartTime, parseTerms, resolvePurdueTerm, toCommaForm,
} from '@/lib/sources/purdue/parsePurdueIo';
import { PurdueIoSource } from '@/lib/sources/purdue/PurdueIoSource';
import { PurdueBoilerGradesSource, chooseTermFiles, headerOf, termStem } from '@/lib/sources/purdue/PurdueBoilerGradesSource';

const fx = (name: string) => readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf8');
const FALL2025 = fx('purdue-grades-fall2025.csv');
const FALL2025_DB = fx('purdue-grades-fall2025_db.csv');
const FALL2021 = fx('purdue-grades-fall2021.csv');
const FALL2023 = fx('purdue-grades-fall2023.csv');
const SECTIONS = JSON.parse(fx('purdue-sections-CS.json')) as unknown;
const TERMS = JSON.parse(fx('purdue-terms.json')) as unknown;
const quiet = { info: () => {}, warn: () => {} };

describe('boiler-grades header validation', () => {
  it('maps the fall2025 header case-insensitively and finds every grade column', () => {
    const header = FALL2025.split('\n')[0].split(';');
    const mapped = mapHeader(header);
    expect(mapped.unknown).toEqual([]);
    expect(mapped.gradeCodes).toEqual(['A', 'A-', 'A+', 'AU', 'B', 'B-', 'B+', 'C', 'C-', 'C+', 'D', 'D-', 'D+', 'E', 'F', 'I', 'N', 'P', 'PI', 'S', 'SI', 'U', 'W']);
    expect(classifyHeader('Academic Period Desc')).toEqual({ kind: 'meta', meta: 'termName' });
    expect(classifyHeader('course_num')).toEqual({ kind: 'meta', meta: 'number' });
    expect(classifyHeader('INSTRUCTOR')).toEqual({ kind: 'meta', meta: 'instructor' });
    expect(classifyHeader('Extra Column')).toEqual({ kind: 'ignore', header: 'Extra Column' });
  });

  it('accepts the SQL-style spellings of the _db exports', () => {
    for (const [raw, code] of [['a_minus', 'A-'], ['a_plus', 'A+'], ['i_f', 'IF'], ['p_i', 'PI'], ['s_i', 'SI'], ['w_f', 'WF'], ['w_n', 'WN'], ['w_u', 'WU'], ['fn', 'FN'], ['e', 'E'], ['A+', 'A+']]) {
      expect(normalizeGradeCode(raw)).toBe(code);
    }
    expect(normalizeGradeCode('blank')).toBeNull();
    expect(normalizeGradeCode('')).toBeNull();
    expect(normalizeGradeCode('Subject')).toBeNull();
  });

  it('names the missing required column', () => {
    expect(() => mapHeader(['Subject', 'Course Number', 'Academic Period', 'A', 'B'])).toThrowError(/"instructor"/);
    expect(() => mapHeader(['Subject', 'Course Number', 'Instructor', 'A'])).toThrowError(BoilerGradesSchemaError);
    expect(() => mapHeader(['Subject', 'Course Number', 'Instructor', 'Academic Period'])).toThrowError(/no grade columns/);
    expect(() => parseBoilerGradesCsv('')).toThrowError(BoilerGradesSchemaError);
  });

  it('detects delimiters and header rows; infers headerless schemas by column count', () => {
    expect(detectDelimiter(FALL2025.split('\n')[0])).toBe(';');
    expect(detectDelimiter(FALL2021.split('\n')[0])).toBe(',');
    expect(isHeaderRow(FALL2025.split('\n')[0].split(';'))).toBe(true);
    expect(isHeaderRow(FALL2025_DB.split('\n')[0].split(';'))).toBe(false);
    expect(inferHeaderlessColumns(33)).toHaveLength(33);
    expect(inferHeaderlessColumns(39)?.includes('w_u')).toBe(true);
    expect(inferHeaderlessColumns(12)).toEqual(HEADERLESS_SCHEMAS[12]);
    expect(inferHeaderlessColumns(99)).toBeNull();
    expect(() => parseBoilerGradesCsv('x;y;z\n1;2;3')).toThrowError(/no known schema for 3 columns/);
  });
});

describe('boiler-grades rows (fall2025 shape, semicolons, cascading blanks)', () => {
  const parsed = parseBoilerGradesCsv(FALL2025, { fileName: 'fall2025.csv' });

  it('parses all 200 fixture rows with fill-forward of subject/course/title/period', () => {
    expect(parsed.rows).toHaveLength(200);
    expect(parsed.hadHeader).toBe(true);
    expect(parsed.delimiter).toBe(';');
    expect(parsed.badTerm + parsed.badCourse + parsed.badCells).toBe(0);
    expect(parsed.rows[0].subject).toBe('AAE');
    for (const r of parsed.rows) {
      expect(['AAE', 'CS', 'MA', 'STAT']).toContain(r.subject);
      expect(r.number).toMatch(/^\d{5}$/);
      expect(r.title).not.toBe('');
      expect(r.academicPeriod).toBe('202610');
      expect(r.termName).toBe('Fall 2025');
      expect(r.term).toBe('2025-fa');
      expect(r.crn).toMatch(/^\d{5}$/);
      expect(r.instructorRaw).not.toBe('');
    }
  });

  it('fills a blank instructor cell forward from the row above', () => {
    const lines = FALL2025.split('\n');
    const blankLine = lines.findIndex((l, i) => i > 0 && l.split(';')[8] === '');
    expect(blankLine).toBeGreaterThan(0);
    const row = parsed.rows.find((r) => r.line === blankLine + 1)!;
    const prev = parsed.rows.find((r) => r.line === blankLine)!;
    expect(row.instructorRaw).toBe(prev.instructorRaw);
  });

  it('reads percentages as numbers keyed by grade code', () => {
    const first = parsed.rows[0];
    expect(first).toMatchObject({ number: '20000', title: 'Ugrad Sophomore Seminar', section: '001', crn: '17446' });
    expect(first.pct.S).toBe(95);
    expect(first.pct.U).toBe(4.4);
    expect(first.pct.W).toBe(0.6);
    expect(first.pct.A).toBe(0);
    expect(parsePercentCell('23.1%')).toBe(23.1);
    expect(parsePercentCell(' 7 % ')).toBe(7);
    expect(parsePercentCell('')).toBe(0);
    expect(Number.isNaN(parsePercentCell('n/a'))).toBe(true);
  });

  it('parses the headerless _db twin identically (columns from the headered file or inferred by count)', () => {
    const columns = headerOf(FALL2025)!;
    const viaHeader = parseBoilerGradesCsv(FALL2025_DB, { columns, fileName: 'fall2025_db.csv' });
    const inferred = parseBoilerGradesCsv(FALL2025_DB, { fileName: 'fall2025_db.csv' });
    expect(viaHeader.hadHeader).toBe(false);
    expect(viaHeader.rows).toHaveLength(12);
    const nonZero = (pct: Record<string, number>) => Object.fromEntries(Object.entries(pct).filter(([, v]) => v > 0));
    const strip = (r: (typeof parsed.rows)[number]) => ({ subject: r.subject, number: r.number, crn: r.crn, instructorRaw: r.instructorRaw, pct: nonZero(r.pct), term: r.term });
    expect(viaHeader.rows.map(strip)).toEqual(parsed.rows.slice(0, 12).map(strip));
    expect(inferred.rows.map(strip)).toEqual(viaHeader.rows.map(strip));
  });
});

describe('boiler-grades schema drift', () => {
  it('fall2021: commas, quoted "Last, First" names and the extra FN/IF/NS/WF/WN/WU codes', () => {
    const parsed = parseBoilerGradesCsv(FALL2021, { fileName: 'fall2021.csv' });
    expect(parsed.delimiter).toBe(',');
    expect(parsed.rows).toHaveLength(29);
    expect(parsed.gradeCodes).toEqual(expect.arrayContaining(['FN', 'IF', 'NS', 'WF', 'WN', 'WU', 'E']));
    expect(parsed.rows[0]).toMatchObject({ subject: 'AAE', number: '33900', term: '2021-fa', instructorRaw: 'Bankole, Soren' });
    expect(parsed.rows.every((r) => r.term === '2021-fa' && r.subject !== '' && r.number !== '')).toBe(true);
    const converted = convertRows(parsed.rows);
    expect(converted.unknownCodes).toEqual([]);
    const withWf = parsed.rows.find((r) => (r.pct.WF ?? 0) > 0)!;
    const b = bucketPercentages(withWf.pct);
    expect(b.w).toBeCloseTo((withWf.pct.W ?? 0) + withWf.pct.WF + (withWf.pct.WN ?? 0) + (withWf.pct.WU ?? 0));
  });

  it('fall2023: headerless per-instructor aggregate (12 columns, letter-only, no CRN)', () => {
    const parsed = parseBoilerGradesCsv(FALL2023, { fileName: 'fall2023.csv' });
    expect(parsed.hadHeader).toBe(false);
    expect(parsed.columns).toEqual(HEADERLESS_SCHEMAS[12]);
    expect(parsed.rows).toHaveLength(12);
    for (const r of parsed.rows) {
      expect(r.term).toBe('2023-fa');
      expect(r.crn).toBe('');
      expect(r.section).toBe('');
      expect(['CS', 'MA']).toContain(r.subject);
      expect(Object.keys(r.pct).sort()).toEqual(['A', 'B', 'C', 'D', 'F', 'I', 'W']);
    }
    const converted = convertRows(parsed.rows);
    const passFail = parsed.rows.filter((r) => r.pct.I === 100);
    expect(converted.droppedRows).toBe(passFail.length);
    for (const row of converted.rows) {
      expect(sumBuckets(row.buckets)).toBe(100);
      expect(row.buckets.aPlus + row.buckets.aMinus + row.buckets.bPlus).toBe(0); // letter-only → plain buckets
    }
  });
});

describe('grade-code mapping and the percent-only rule (§4.1)', () => {
  it('classifies every known code as bucketed or excluded', () => {
    for (const code of KNOWN_CODES) expect(code in CODE_TO_BUCKET || EXCLUDED_CODES.includes(code)).toBe(true);
    expect(CODE_TO_BUCKET).toMatchObject({ 'A+': 'aPlus', 'A-': 'aMinus', E: 'f', F: 'f', FN: 'f', IF: 'f', W: 'w', WF: 'w', WN: 'w', WU: 'w' });
    expect(EXCLUDED_CODES).toEqual(['AU', 'I', 'N', 'NS', 'P', 'PI', 'S', 'SI', 'U']);
  });

  it('scales letter + W percentages to integers summing to 100 by largest remainder (ties in bucket order)', () => {
    const thirds = scalePercentBuckets({ a: 33.3, b: 33.3, c: 33.4 })!;
    expect([thirds.buckets.a, thirds.buckets.b, thirds.buckets.c]).toEqual([33, 33, 34]);
    expect(sumBuckets(thirds.buckets)).toBe(100);
    const renorm = scalePercentBuckets({ a: 45, b: 45, w: 5 })!;   // + 5 % S excluded upstream → renormalised over 95
    expect(renorm.buckets).toMatchObject({ a: 48, b: 47, w: 5 });
    expect(sumBuckets(renorm.buckets)).toBe(100);
    expect(renorm.letterSharePct).toBe(90);
    expect(renorm.countedSharePct).toBe(95);
    expect(scalePercentBuckets({})).toBeNull();
    expect(scalePercentBuckets({ a: 0, w: 0 })).toBeNull();
  });

  it('turns a section into a percent-only RawGradeRow (students 100, weight 1)', () => {
    const parsed = parseBoilerGradesCsv(FALL2025);
    const graded = parsed.rows.find((r) => r.number === '20300')!;
    const out = toRawGradeRow(graded);
    expect('row' in out).toBe(true);
    if (!('row' in out)) return;
    expect(out.row).toMatchObject({ year: 2025, term: 'Fall', yearTerm: '2025-fa', subject: 'AAE', number: '20300', schedType: '', students: 100, percentOnly: true, weight: 1, crn: graded.crn });
    expect(sumBuckets(out.row.buckets)).toBe(100);
    const w = out.row.buckets.w;
    expect(w).toBe(Math.round(graded.pct.W));
    const letters = LETTER_BUCKET_KEYS.reduce((s, k) => s + out.row.buckets[k], 0);
    expect(letters + w).toBe(100);
  });

  it('drops pass/fail sections and counts excluded codes per row', () => {
    const parsed = parseBoilerGradesCsv(FALL2025);
    const seminar = parsed.rows[0];                       // 95 % S, 4.4 % U, 0.6 % W → no letter curve
    expect(toRawGradeRow(seminar)).toEqual({ reason: 'letter-share-below-minimum', letterSharePct: 0 });
    const converted = convertRows(parsed.rows);
    expect(converted.droppedRows).toBeGreaterThan(0);
    expect(converted.rows.length + converted.droppedRows).toBe(200);
    expect(converted.excludedGradeCodes.S).toBeGreaterThan(0);
    expect(converted.excludedGradeCodes.U).toBeGreaterThan(0);
    expect(Object.keys(converted.excludedGradeCodes).every((c) => EXCLUDED_CODES.includes(c))).toBe(true);
    expect(MIN_LETTER_SHARE_PCT).toBe(50);
    const mostlyIncomplete = { ...seminar, pct: { A: 30, B: 10, I: 60 } };
    expect(toRawGradeRow(mostlyIncomplete)).toMatchObject({ reason: 'letter-share-below-minimum', letterSharePct: 40 });
  });

  it('keeps one row per (term, CRN) — the finest distribution — and counts the coarse twins as dropped', () => {
    const parsed = parseBoilerGradesCsv(FALL2021);
    const group = parsed.rows.filter((r) => r.crn === '26999');
    expect(group).toHaveLength(3);
    expect(group.every((r) => r.instructorRaw === 'Okonkwo-Reyes, Thaddeus' && r.number === '18000')).toBe(true);
    const { kept, duplicates } = dedupeByCrn(parsed.rows);
    expect(kept.filter((r) => r.crn === '26999')).toHaveLength(1);
    expect(kept.find((r) => r.crn === '26999')!.pct.A).toBeCloseTo(50.3);
    expect(duplicates.map((r) => r.crn)).toEqual(['26999', '26999']);
    expect(kept.length + duplicates.length).toBe(parsed.rows.length);
    const converted = convertRows(parsed.rows);
    expect(converted.dropped.filter((d) => d.reason === 'duplicate-crn')).toHaveLength(2);
    expect(converted.rows.filter((r) => r.crn === '26999')).toHaveLength(1);
    expect(converted.rows.find((r) => r.crn === '26999')!.suppressed).toBeUndefined();
    // Rows without a CRN (the aggregate file) are never merged.
    const agg = parseBoilerGradesCsv(FALL2023);
    expect(dedupeByCrn(agg.rows).duplicates).toEqual([]);
  });

  it('suppresses rows whose percentages imply a cohort of ≤ MAX_TINY_COHORT_N students', () => {
    expect(MAX_TINY_COHORT_N).toBe(3);
    expect(impliedCohortSize({ pct: { A: 100 } })).toBe(1);
    expect(impliedCohortSize({ pct: { A: 50, B: 50 } })).toBe(2);
    expect(impliedCohortSize({ pct: { 'A+': 33.3, A: 66.7 } })).toBe(3);
    expect(impliedCohortSize({ pct: { A: 33.3, B: 33.3, W: 33.4 } })).toBe(3);
    expect(impliedCohortSize({ pct: { A: 25, B: 75 } })).toBeNull();
    expect(impliedCohortSize({ pct: { A: 23.1, B: 76.9 } })).toBeNull();
    expect(impliedCohortSize({ pct: {} })).toBeNull();
    const parsed = parseBoilerGradesCsv(FALL2021);
    const converted = convertRows(parsed.rows);
    const tiny = converted.rows.find((r) => r.crn === '27001')!;
    expect(tiny).toMatchObject({ suppressed: true, percentOnly: true, students: 100 });
    expect(tiny.buckets).toMatchObject({ a: 50, b: 50 });
    expect(converted.tinyCohortRows).toBeGreaterThanOrEqual(1);
    expect(converted.rows.filter((r) => r.suppressed).length).toBe(converted.tinyCohortRows);
    const full = converted.rows.find((r) => r.crn === '14973')!;
    expect(full.suppressed).toBeUndefined();
  });

  it('instructor strings parse with the existing matcher ("Last, First M.")', () => {
    const key = parseName('Okonkwo, Adaeze A.')!;
    expect(key).toMatchObject({ last: 'okonkwo', firstToken: 'adaeze', middleInitials: ['a'] });
    const particle = parseName('Rodríguez de jesús, Alejandro')!;
    expect(particle.lastCompact).toBe('rodriguezdejesus');
  });
});

describe('Purdue term codes', () => {
  it('maps Banner academic periods to TermCodes and back', () => {
    expect(termFromPurdueCode('202610')).toBe('2025-fa');
    expect(termFromPurdueCode('202613')).toBe('2026-wi');
    expect(termFromPurdueCode('202620')).toBe('2026-sp');
    expect(termFromPurdueCode('202630')).toBe('2026-su');
    expect(termFromPurdueCode(202710)).toBe('2026-fa');
    expect(termFromPurdueCode('999999')).toBeNull();
    expect(termFromPurdueCode('Fall 2025')).toBeNull();
    for (const t of ['2025-fa', '2026-wi', '2026-sp', '2026-su'] as const) expect(termFromPurdueCode(purdueCodeFromTerm(t))).toBe(t);
  });

  it('parses period descriptions ("Winter 2025" is our 2026-wi)', () => {
    expect(termFromPurdueName('Fall 2025')).toBe('2025-fa');
    expect(termFromPurdueName('Winter 2025')).toBe('2026-wi');
    expect(termFromPurdueName('Summer 2023')).toBe('2023-su');
    expect(termFromPurdueName('Term X')).toBeNull();
    expect(purdueTermName('2026-wi')).toBe('Winter 2025');
    expect(purdueTermName('2026-fa')).toBe('Fall 2026');
  });

  it('parseTerms / resolvePurdueTerm on the purdue.io fixture', () => {
    const terms = parseTerms(TERMS);
    expect(terms.map((t) => t.code)).toEqual(['202610', '202613', '202620', '202630', '202710', '202713']);
    expect(resolvePurdueTerm('2026-fa', terms)?.code).toBe('202710');
    expect(resolvePurdueTerm('2027-sp', terms)?.code).toBe('202713');
    expect(resolvePurdueTerm('2020-fa', terms)).toBeNull();
  });
});

describe('purdue.io sections', () => {
  const parsed = parseSectionsJson(SECTIONS, 'CS');
  const multi = parsed.sections.find((s) => s.instructorsRaw.length >= 2)!;
  const arranged = parsed.sections.find((s) => s.meetings.some((m) => m.days.length === 0))!;

  it('yields one RawSection per section, offered with unknown seats, sorted by CRN', () => {
    expect(parsed.sections).toHaveLength(12);
    expect(parsed.subjectNames.CS).toBe('Computer Sciences');
    for (const s of parsed.sections) {
      expect(s).toMatchObject({ subject: 'CS', statusCode: 'A', seatsKnown: false });
      expect(s.crn).toMatch(/^\d{5}$/);
      expect(s.number).toMatch(/^\d{5}$/);
    }
    expect(parsed.sections.map((s) => s.crn)).toEqual([...parsed.sections.map((s) => s.crn)].sort((a, b) => Number(a) - Number(b)));
    expect(parseSectionsJson(SECTIONS, 'MA').sections).toEqual([]);
  });

  it('keeps every co-instructor in comma form and dedupes across meetings', () => {
    expect(multi).toBeDefined();
    expect(new Set(multi.instructorsRaw).size).toBe(multi.instructorsRaw.length);
    for (const name of multi.instructorsRaw) expect(name).toMatch(/^[^,]+, [^,]+$/);
  });

  it('re-orders "First M. Last" to "Last, First M." keeping hyphens and particles', () => {
    expect(toCommaForm('Gustavo Rodriguez-Rivera')).toBe('Rodriguez-Rivera, Gustavo');
    expect(toCommaForm('Ana de la Cruz')).toBe('de la Cruz, Ana');
    expect(toCommaForm('Michael R. Gribskov')).toBe('Gribskov, Michael R.');
    expect(toCommaForm('  Sai Rahul Reddy   Kondlapudi ')).toBe('Kondlapudi, Sai Rahul Reddy');
    expect(toCommaForm('Cher')).toBe('Cher');
    expect(toCommaForm('Agyei, Ronald F.')).toBe('Agyei, Ronald F.');
    const a = parseName('Rodriguez-Rivera, Gustavo')!;
    const b = parseName(toCommaForm('Gustavo Rodriguez-Rivera'))!;
    expect([b.lastCompact, b.firstToken]).toEqual([a.lastCompact, a.firstToken]);
  });

  it('maps days, start time + duration, rooms and meeting types', () => {
    expect(parseDaysOfWeek('Monday, Wednesday, Friday')).toEqual(['M', 'W', 'F']);
    expect(parseDaysOfWeek('Tuesday, Thursday')).toEqual(['T', 'R']);
    expect(parseDaysOfWeek('None')).toEqual([]);
    expect(parseStartTime('13:30:00.0000000')).toBe('13:30');
    expect(parseStartTime(null)).toBeNull();
    expect(parseDurationMinutes('PT1H15M')).toBe(75);
    expect(parseDurationMinutes('PT50M')).toBe(50);
    expect(parseDurationMinutes('PT0S')).toBe(0);
    expect(addMinutes('13:30', 75)).toBe('14:45');
    expect(meetingTypeCode('Lecture')).toBe('LEC');
    expect(meetingTypeCode('Laboratory')).toBe('LAB');
    expect(meetingTypeCode('Recitation')).toBe('DIS');
    expect(meetingTypeCode('Distance Learning')).toBe('ONL');
    expect(meetingTypeCode('Practice Study Observation')).toBe('PSO');
    expect(meetingTypeCode('Something New')).toBe('SN');
    const timed = parsed.sections.flatMap((s) => s.meetings).find((m) => m.start !== null)!;
    expect(timed.end).not.toBeNull();
    expect(timed.days.length).toBeGreaterThan(0);
    const m = arranged.meetings.find((x) => x.days.length === 0)!;
    expect(m).toMatchObject({ start: null, end: null, building: null, room: null });
  });
});

describe('PurdueBoilerGradesSource', () => {
  it('prefers _db files, borrows the header of the twin, applies the window and reports §4 bookkeeping', async () => {
    expect(termStem('fall2025_db.csv')).toEqual({ stem: 'fall2025', isDb: true });
    expect(chooseTermFiles(['fall2025.csv', 'fall2025_db.csv', 'fall2021.csv', 'README.md'])).toEqual([
      { data: 'fall2021.csv', headerFrom: null }, { data: 'fall2025_db.csv', headerFrom: 'fall2025.csv' },
    ]);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'profpeek-purdue-'));
    await mkdir(dir, { recursive: true });
    for (const f of ['fall2025.csv', 'fall2025_db.csv', 'fall2021.csv', 'fall2023.csv']) {
      await copyFile(path.join(process.cwd(), 'tests', 'fixtures', `purdue-grades-${f}`), path.join(dir, f));
    }
    const src = new PurdueBoilerGradesSource({ currentTerm: '2026-fa', yearsBack: 2, dir, log: quiet });
    expect(src.info).toMatchObject({ id: 'purdue-boiler-grades', license: 'GPL-3.0' });
    const out = await src.fetch({ schoolId: 'purdue' });
    expect(out.files.map((f) => f.file)).toEqual(['fall2021.csv', 'fall2023.csv', 'fall2025_db.csv']);
    expect(out.files.find((f) => f.file === 'fall2021.csv')?.kept).toBe(0);            // 2021-fa is outside 2026-fa − 2y
    expect(out.files.find((f) => f.file === 'fall2021.csv')?.dropped).toBe(0);         // §4 bookkeeping is window-scoped
    expect(out.files.find((f) => f.file === 'fall2025_db.csv')?.rows).toBe(12);
    expect(out.tinyCohortRows).toBe(out.rows.filter((r) => r.suppressed).length);
    expect(out.rows.every((r) => r.percentOnly === true && r.weight === 1 && r.students === 100)).toBe(true);
    expect(out.rows.every((r) => ['2025-fa', '2023-fa'].includes(r.yearTerm))).toBe(true);
    expect(out.droppedRows).toBeGreaterThan(0);
    expect(out.excludedGradeCodes.S).toBeGreaterThan(0);
    expect(Date.parse(out.fetchedAt)).not.toBeNaN();
    await expect(src.fetch({ schoolId: 'uiuc' })).rejects.toThrowError(/only serves school "purdue"/);
    const missing = new PurdueBoilerGradesSource({ currentTerm: '2026-fa', yearsBack: 6, dir: path.join(dir, 'nope'), log: quiet });
    await expect(missing.fetch({ schoolId: 'purdue' })).rejects.toThrowError(/fetch-purdue/);
  });
});

describe('PurdueIoSource', () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const body = url.includes('/Terms') ? fx('purdue-terms.json') : decodeURIComponent(url).includes("Abbreviation eq 'CS'") ? fx('purdue-sections-CS.json') : '{"value":[]}';
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  };

  it('resolves the Banner term code, filters by subject and returns offered sections', async () => {
    const src = new PurdueIoSource({ fetchImpl, useCache: false, delayMs: 0, log: quiet });
    expect(src.info.id).toBe('purdue-io');
    const out = await src.fetchSections({ schoolId: 'purdue', term: '2026-fa', subject: 'cs' });
    expect(out.term).toBe('2026-fa');
    expect(out.sections).toHaveLength(12);
    expect(calls.some((u) => u.endsWith('/Terms'))).toBe(true);
    const sectionsUrl = calls.find((u) => u.includes('/Sections?'))!;
    expect(decodeURIComponent(sectionsUrl)).toContain("Class/Term/Code eq '202710' and Class/Course/Subject/Abbreviation eq 'CS'");
    expect(decodeURIComponent(sectionsUrl)).toContain('$expand=Class($expand=Course($expand=Subject)),Meetings($expand=Instructors');
    expect(src.subjectNames.CS).toBe('Computer Sciences');
    const empty = await src.fetchSections({ schoolId: 'purdue', term: '2026-fa', subject: 'MA' });
    expect(empty.sections).toEqual([]);
    expect(calls.filter((u) => u.endsWith('/Terms'))).toHaveLength(1);            // Terms fetched once per instance
  });

  it('falls back to the latest listed term and refuses other schools', async () => {
    const warnings: string[] = [];
    const src = new PurdueIoSource({ fetchImpl, useCache: false, delayMs: 0, log: { info: () => {}, warn: (m) => warnings.push(m) } });
    const out = await src.fetchSections({ schoolId: 'purdue', term: '2099-fa', subject: 'CS' });
    expect(out.term).toBe('2027-wi');
    expect(warnings[0]).toMatch(/2099-fa not listed; falling back to 2027-wi/);
    await expect(src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).rejects.toThrowError(/only serves "purdue"/);
  });
});

describe('registry entry', () => {
  it('SchoolConfig follows §4.1/§4.2 (percent-only, no seats, no reviews, 20-subject allowlist)', () => {
    expect(PURDUE).toMatchObject({ id: 'purdue', mode: 'live', gradeValueKind: 'percent', gradeBuckets: 'plus-minus', seatStatusAvailable: false });
    expect(PURDUE.sources).toEqual({ grades: { kind: 'purdue-boiler-grades' }, schedule: { kind: 'purdue-io' }, reviews: null });
    expect(PURDUE_SUBJECTS).toHaveLength(20);
    expect(new Set(PURDUE_SUBJECTS).size).toBe(20);
    expect(PURDUE.attribution.grades).toMatch(/public records/);
    expect(PURDUE.attribution.schedule).toMatch(/purdue\.io/);
  });

  it('register.ts adds both adapter kinds', async () => {
    await import('@/lib/sources/purdue/register');
    const { registeredAdapterKinds } = await import('@/lib/sources/registry');
    expect(registeredAdapterKinds().grades).toContain('purdue-boiler-grades');
    expect(registeredAdapterKinds().schedule).toContain('purdue-io');
  });
});
