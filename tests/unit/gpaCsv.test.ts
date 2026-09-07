import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CsvSchemaError,
  GPA_CSV_COLUMNS,
  filterGradeWindow,
  parseGpaCsv,
  validateGpaCsvHeader,
} from '@/lib/sources/uiuc/parseGpaCsv';
import { UiucGpaCsvSource } from '@/lib/sources/uiuc/UiucGpaCsvSource';

const FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'uiuc-gpa-sample.csv');
const text = readFileSync(FIXTURE, 'utf8');

describe('parseGpaCsv header validation', () => {
  it('has the exact 23 upstream columns', () => {
    expect(GPA_CSV_COLUMNS).toHaveLength(23);
    expect(text.split('\n')[0]).toBe(GPA_CSV_COLUMNS.join(','));
  });

  it('names the missing column in CsvSchemaError', () => {
    const broken = text.replace('Sched Type', 'Schedule Type');
    expect(() => parseGpaCsv(broken)).toThrowError(CsvSchemaError);
    expect(() => parseGpaCsv(broken)).toThrowError(/"Sched Type"/);
    const noInstructor = text.replace(',Primary Instructor', '');
    expect(() => parseGpaCsv(noInstructor)).toThrowError(/"Primary Instructor"/);
  });

  it('ignores (and reports) unknown extra columns', () => {
    const header = [...GPA_CSV_COLUMNS, 'Extra'];
    expect(validateGpaCsvHeader(header)).toEqual(['Extra']);
    const lines = text.split('\n');
    const withExtra = [lines[0] + ',Extra', ...lines.slice(1).filter(Boolean).map((l) => l + ',x')].join('\n');
    const result = parseGpaCsv(withExtra);
    expect(result.extraColumns).toEqual(['Extra']);
    expect(result.rows).toHaveLength(200);
  });

  it('rejects an empty file', () => {
    expect(() => parseGpaCsv('')).toThrowError(CsvSchemaError);
  });
});

describe('parseGpaCsv rows', () => {
  const result = parseGpaCsv(text);

  it('parses all 200 fixture rows', () => {
    expect(result.rows).toHaveLength(200);
    expect(result.studentsMismatch).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('students === Σ buckets for every row', () => {
    for (const row of result.rows) {
      const sum = Object.values(row.buckets).reduce((a, b) => a + b, 0);
      expect(row.students).toBe(sum);
    }
  });

  it('maps CSV cells to RawGradeRow fields', () => {
    const first = result.rows[0];
    expect(first).toMatchObject({
      year: 2023, term: 'Spring', yearTerm: '2023-sp', subject: 'CS', number: '225',
      title: 'Data Structures', schedType: 'LEC', instructorRaw: 'Okonkwo, Adaeze M',
    });
    expect(first.buckets).toEqual({
      aPlus: 3, a: 14, aMinus: 5, bPlus: 4, b: 7, bMinus: 3, cPlus: 0, c: 5, cMinus: 3,
      dPlus: 1, d: 1, dMinus: 1, f: 2, w: 0,
    });
    expect(first.students).toBe(49);
  });

  it("upper-cases Sched Type and maps '' to UNKNOWN", () => {
    const unknown = result.rows.filter((r) => r.schedType === 'UNKNOWN');
    expect(unknown.length).toBeGreaterThan(0);
    for (const r of result.rows) expect(r.schedType).toBe(r.schedType.toUpperCase());
    expect(parseGpaCsv(text.replace(',LEC,', ',Lec,')).rows.some((r) => r.schedType === 'LEC')).toBe(true);
  });

  it('keeps empty-instructor rows with instructorRaw === ""', () => {
    const empty = result.rows.filter((r) => r.instructorRaw === '');
    expect(empty).toHaveLength(2);
    expect(empty[0].students).toBeGreaterThan(0);
  });

  it('trusts the buckets and warns when Students disagrees', () => {
    const lines = text.split('\n');
    const cells = lines[1].split(',');
    cells[21] = String(Number(cells[21]) + 5);
    const warnings: string[] = [];
    const r = parseGpaCsv([lines[0], cells.join(',')].join('\n'), { onWarn: (m) => warnings.push(m) });
    expect(r.rows[0].students).toBe(49);
    expect(r.studentsMismatch).toBe(1);
    expect(warnings[0]).toMatch(/Students=54/);
  });

  it('rejects a malformed YearTerm', () => {
    const lines = text.split('\n');
    expect(() => parseGpaCsv([lines[0], lines[1].replace('2023-sp', '2023-xx')].join('\n'))).toThrowError(/YearTerm/);
  });
});

describe('filterGradeWindow', () => {
  const { rows } = parseGpaCsv(text);
  it('keeps rows with ordinal ≥ ordinal(current) − 10·yearsBack', () => {
    // current 2026-fa (20263), yearsBack 2 → keep ≥ 20243 (2024-fa and later)
    const { kept, discarded } = filterGradeWindow(rows, '2026-fa', 2);
    expect(kept.length + discarded).toBe(200);
    expect(kept.every((r) => ['2024-fa', '2025-sp', '2025-fa', '2026-wi'].includes(r.yearTerm))).toBe(true);
    expect(kept.some((r) => r.yearTerm === '2024-fa')).toBe(true);
    expect(discarded).toBeGreaterThan(0);
    expect(filterGradeWindow(rows, '2026-fa', 10).discarded).toBe(0);
  });
});

describe('UiucGpaCsvSource', () => {
  it('reads the CSV from disk and applies the window', async () => {
    const logs: string[] = [];
    const src = new UiucGpaCsvSource({
      currentTerm: '2026-fa', yearsBack: 2, csvPath: FIXTURE,
      log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) },
    });
    expect(src.info.id).toBe('uiuc-gpa-csv');
    expect(src.info.license).toBeNull(); // repo declares no licence; grades are Illinois public records
    const out = await src.fetch({ schoolId: 'uiuc' });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.rows.length).toBeLessThan(200);
    expect(Date.parse(out.fetchedAt)).not.toBeNaN();
    expect(logs.some((l) => /discarded \d+/.test(l))).toBe(true);
  });

  it('gives an actionable error when the file is missing', async () => {
    const src = new UiucGpaCsvSource({ currentTerm: '2026-fa', yearsBack: 6, csvPath: 'tests/fixtures/nope.csv' });
    await expect(src.fetch({ schoolId: 'uiuc' })).rejects.toThrowError(/data:fetch/);
  });
});

describe('DemoGradeSource (same parser, fictional CSV)', () => {
  it('parses data/raw/demo/demo/gpa.csv through parseGpaCsv and labels the seed', async () => {
    const { DemoGradeSource } = await import('@/lib/sources/demo/DemoGradeSource');
    const src = new DemoGradeSource({ seed: 20260903, log: { info: () => {}, warn: () => {} } });
    expect(src.info).toEqual({ id: 'demo-grades', label: 'Fictional demo data (seed 20260903)', url: null, license: 'MIT' });
    const out = await src.fetch({ schoolId: 'demo' });
    expect(out.rows.length).toBeGreaterThan(100);
    for (const row of out.rows.slice(0, 50)) {
      expect(row.students).toBe(Object.values(row.buckets).reduce((a, b) => a + b, 0));
      expect(row.yearTerm).toMatch(/^\d{4}-(fa|sp|su|wi)$/);
    }
  });

  it('works against an arbitrary directory (fixture copy)', async () => {
    const { mkdtemp, mkdir, copyFile } = await import('node:fs/promises');
    const os = await import('node:os');
    const { DemoGradeSource } = await import('@/lib/sources/demo/DemoGradeSource');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'profpeek-demo-'));
    await mkdir(path.join(dir, 'demo'), { recursive: true });
    await copyFile(FIXTURE, path.join(dir, 'demo', 'gpa.csv'));
    const src = new DemoGradeSource({ seed: 1, dir, currentTerm: '2026-fa', yearsBack: 2, log: { info: () => {}, warn: () => {} } });
    const out = await src.fetch({ schoolId: 'demo' });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.rows.length).toBeLessThan(200);
  });
});

describe('demo schedule/review adapters and registry', () => {
  it('DemoScheduleSource returns seat-known sections for a subject', async () => {
    const { DemoScheduleSource, DEMO_FETCHED_AT } = await import('@/lib/sources/demo/DemoScheduleSource');
    const src = new DemoScheduleSource({ seed: 20260903 });
    const out = await src.fetchSections({ schoolId: 'demo', term: '2026-fa', subject: 'CS' });
    expect(out.term).toBe('2026-fa');
    expect(out.fetchedAt).toBe(DEMO_FETCHED_AT);
    expect(out.sections.length).toBeGreaterThan(0);
    for (const s of out.sections) {
      expect(s.subject).toBe('CS');
      expect(s.seatsKnown).toBe(true);
      expect(['open', 'waitlist', 'closed']).toContain(s.statusCode);
    }
  });

  it('DemoReviewSource marks every professor fictional and serves their reviews', async () => {
    const { DemoReviewSource } = await import('@/lib/sources/demo/DemoReviewSource');
    const src = new DemoReviewSource({ seed: 20260903, log: { info: () => {}, warn: () => {} } });
    const profs = await src.fetchProfessors({ schoolId: 'demo', subjects: ['CS'] });
    expect(profs.length).toBeGreaterThan(0);
    expect(profs.every((p) => p.isFictional)).toBe(true);
    const reviews = await src.fetchReviews(profs[0].sourceId);
    expect(Array.isArray(reviews)).toBe(true);
    expect(await src.fetchReviews('no-such-professor')).toEqual([]);
  });

  it('registry resolves adapters per school from its SchoolConfig (MULTI_SCHOOL_DESIGN §2)', async () => {
    const { loadEnv } = await import('@/lib/config/env');
    const { getSources, NullReviewSource, registeredAdapterKinds } = await import('@/lib/sources/registry');
    const env = loadEnv({} as NodeJS.ProcessEnv);
    const demo = getSources('demo', env);
    expect([demo.grades.info.id, demo.schedule.info.id, demo.reviews.info.id]).toEqual(['demo-grades', 'demo-schedule', 'demo-reviews']);
    const uiuc = getSources('uiuc', env);
    expect([uiuc.grades.info.id, uiuc.schedule.info.id, uiuc.reviews.info.id]).toEqual(['uiuc-gpa-csv', 'uiuc-course-explorer', 'none']);
    expect(uiuc.reviews).toBeInstanceOf(NullReviewSource);
    expect(registeredAdapterKinds().grades).toEqual(expect.arrayContaining(['demo-grades', 'uiuc-gpa-csv']));
    expect(registeredAdapterKinds().reviews).toContain('rmp-graphql'); // registered, wired by no school
    expect(() => getSources('nope', env)).toThrowError(/Unknown school/);
  });
});
