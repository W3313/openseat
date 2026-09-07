// UT Dallas adapter (MULTI_SCHOOL_DESIGN §4, §4.2, §7): term codes from file names, header drift across
// terms, bucket mapping incl. every excluded code, instructor parsing (up to six columns), the source over
// a directory of term files, the registry kind and the school config. Fixture names are fictional.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { UTD, UTD_SUBJECTS } from '@/lib/config/schools/utd';
import { SCHOOL_ID_RE } from '@/lib/config/schools/types';
import { parseName } from '@/lib/matching';
import { registeredAdapterKinds } from '@/lib/sources/registry';
import '@/lib/sources/utd/register';
import {
  UTD_EXCLUDED_COLUMNS, UTD_LETTER_COLUMNS, UTD_REQUIRED_COLUMNS, UtdCsvRowError, UtdCsvSchemaError,
  cleanInstructorCell, parseCountCell, parseUtdGradesCsv, splitInstructors, termFromUtdCode, termFromUtdFilename,
  utdCodeFromTerm, validateUtdHeader,
} from '@/lib/sources/utd/parseUtdGradesCsv';
import { UTD_GRADES_SOURCE_INFO, UtdGradesCsvSource, listUtdTermFiles } from '@/lib/sources/utd/UtdGradesCsvSource';
import { USER_AGENT, selectTermFiles } from '../../scripts/fetch-utd';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');
const text25f = readFileSync(path.join(FIXTURES, 'utd-grades-sample.csv'), 'utf8');
const text21f = readFileSync(path.join(FIXTURES, 'utd-grades-sample-21f.csv'), 'utf8');
const HEADER_25F = text25f.split('\n')[0];
const parsed = parseUtdGradesCsv(text25f, { term: '2025-fa' });
const bySection = (section: string) => parsed.rows.find((r) => r.subject === 'ACCT' && r.section === section)!;

describe('UTD term codes', () => {
  it('maps <yy><f|s|u> to TermCode', () => {
    expect(termFromUtdCode('25f')).toBe('2025-fa');
    expect(termFromUtdCode('25s')).toBe('2025-sp');
    expect(termFromUtdCode('25u')).toBe('2025-su');
    expect(termFromUtdCode('20F')).toBe('2020-fa');
    for (const bad of ['5f', '25w', '2025f', '25', '']) expect(termFromUtdCode(bad)).toBeNull();
  });

  it('reads the term from the file name only', () => {
    expect(termFromUtdFilename('enhanced_grades_enhanced_grades_25f.csv')).toBe('2025-fa');
    expect(termFromUtdFilename('enhanced_grades_enhanced_grades_18u.csv')).toBe('2018-su');
    expect(termFromUtdFilename('Fall 2017.csv')).toBeNull();
    expect(termFromUtdFilename('matched_professor_data.json')).toBeNull();
  });

  it('round-trips through utdCodeFromTerm and has no winter term', () => {
    for (const code of ['25f', '25s', '25u', '20f']) expect(utdCodeFromTerm(termFromUtdCode(code)!)).toBe(code);
    expect(utdCodeFromTerm('2025-wi')).toBeNull();
    expect(utdCodeFromTerm('1999-fa')).toBeNull();
  });
});

describe('UTD header validation', () => {
  it('accepts the 30-column 2025 header and the 2021 "Catalog Number" variant with a different code order', () => {
    const h25 = validateUtdHeader(HEADER_25F.split(','));
    expect(h25).toEqual({ catalogColumn: 'Catalog Nbr', excludedColumns: ['CR', 'I', 'NC', 'P'], extraColumns: [] });
    const h21 = validateUtdHeader(text21f.split('\n')[0].split(','));
    expect(h21.catalogColumn).toBe('Catalog Number');
    expect(h21.excludedColumns).toEqual(['P', 'CR', 'NC', 'I']);
  });

  it('tolerates terms without I / NC (summer 2022) and reports extra columns', () => {
    const cols = HEADER_25F.split(',').filter((c) => c !== 'I' && c !== 'NC');
    expect(validateUtdHeader(cols).excludedColumns).toEqual(['CR', 'P']);
    expect(validateUtdHeader([...cols, 'Notes']).extraColumns).toEqual(['Notes']);
    expect(UTD_REQUIRED_COLUMNS).toHaveLength(2 + 13 + 1 + 6 + 3);
  });

  it('names the missing column', () => {
    expect(() => parseUtdGradesCsv(text25f.replace('Instructor 6', 'Instructor Six'), { term: '2025-fa' })).toThrowError(UtdCsvSchemaError);
    expect(() => parseUtdGradesCsv(text25f.replace('Instructor 6', 'Instructor Six'), { term: '2025-fa' })).toThrowError(/"Instructor 6"/);
    expect(() => parseUtdGradesCsv(text25f.replace('Catalog Nbr', 'Course'), { term: '2025-fa' })).toThrowError(/Catalog Nbr/);
    expect(() => parseUtdGradesCsv('', { term: '2025-fa' })).toThrowError(UtdCsvSchemaError);
  });
});

describe('UTD count cells', () => {
  it('reads empty as 0 and integer-valued floats as integers', () => {
    expect(parseCountCell('')).toBe(0);
    expect(parseCountCell('  ')).toBe(0);
    expect(parseCountCell('12')).toBe(12);
    expect(parseCountCell('1.0')).toBe(1);
    expect(parseCountCell('2.00')).toBe(2);
    for (const bad of ['1.5', '-1', 'x', '1e3']) expect(parseCountCell(bad)).toBeNull();
  });

  it('rejects a non-integer count with the line number', () => {
    const broken = text25f.replace('\nACCT,2301,002,12,5,11,', '\nACCT,2301,002,12,5.5,11,');
    expect(() => parseUtdGradesCsv(broken, { term: '2025-fa' })).toThrowError(UtdCsvRowError);
    expect(() => parseUtdGradesCsv(broken, { term: '2025-fa' })).toThrowError(/line 3: "A" = "5.5"/);
  });
});

describe('UTD rows and bucket mapping', () => {
  it('parses 197 of the 200 fixture rows (three pass/fail-only sections dropped) with the term from the caller', () => {
    expect(parsed.rows).toHaveLength(197);
    expect(parsed.droppedRows).toBe(3);
    expect(parsed.warnings).toEqual([]);
    expect(bySection('009')).toBeUndefined();
    for (const r of parsed.rows) {
      expect(r).toMatchObject({ year: 2025, term: 'Fall', yearTerm: '2025-fa', schedType: '' });
      expect(r.students).toBe(Object.values(r.buckets).reduce((a, b) => a + b, 0));
      expect('percentOnly' in r).toBe(false); // counts, not percentages (§4.1 does not apply)
    }
  });

  it('maps the 13 letter columns and W; empty cells are 0', () => {
    expect(UTD_LETTER_COLUMNS.map(([c]) => c)).toEqual(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']);
    const first = bySection('001');
    expect(first).toMatchObject({ subject: 'ACCT', number: '2301', title: 'Introductory Financial Accounting', instructorRaw: 'Ashdown, Thaddeus L' });
    expect(first.buckets).toEqual({ aPlus: 10, a: 9, aMinus: 5, bPlus: 0, b: 3, bMinus: 5, cPlus: 4, c: 2, cMinus: 2, dPlus: 2, d: 1, dMinus: 8, f: 6, w: 2 });
    expect(first.students).toBe(59);
    expect(bySection('004').buckets.b).toBe(2); // "2.0"
    expect(bySection('005').buckets.a).toBe(1); // "1.0"
  });

  it('excludes CR / I / NC / P from the buckets and counts rows per code (students stay on row.excluded)', () => {
    expect(UTD_EXCLUDED_COLUMNS).toEqual(['CR', 'I', 'NC', 'P']);
    const row = bySection('011');
    expect(row.excluded).toEqual({ CR: 1, I: 2, NC: 3, P: 4 });
    expect(row.buckets.w).toBe(2);
    expect(Object.values(row.buckets).reduce((a, b) => a + b, 0)).toBe(row.students);
    for (const code of UTD_EXCLUDED_COLUMNS) expect(parsed.excludedGradeCodes[code]).toBeGreaterThanOrEqual(1);
    // §4 "with counts" = row counts: section 011 (CR 1) and the dropped CR-only section (CR 14) are two rows, not 15 students.
    expect(parsed.excludedGradeCodes.CR).toBeGreaterThanOrEqual(2);
    const crRows = parsed.rows.filter((r) => (r.excluded.CR ?? 0) > 0).length;
    expect(parsed.excludedGradeCodes.CR).toBeGreaterThanOrEqual(crRows);
    expect(parsed.excludedGradeCodes.CR).toBeLessThanOrEqual(crRows + parsed.droppedRows);
  });

  it('keeps a withdrawal-only section (students = W, no letters)', () => {
    const w = bySection('010');
    expect(w.students).toBe(2);
    expect(w.buckets.w).toBe(2);
    expect(Object.entries(w.buckets).filter(([k]) => k !== 'w').every(([, v]) => v === 0)).toBe(true);
  });

  it('upper-cases subject and catalog number and keeps variable-credit numbers', () => {
    expect(bySection('014').number).toBe('4V95');
    expect(parseUtdGradesCsv(text25f.replace('\nACCT,2301,001,', '\nacct,2301a,001,'), { term: '2025-fa' }).rows[0]).toMatchObject({ subject: 'ACCT', number: '2301A' });
  });

  it('parses the 2021 layout (Catalog Number, P/CR/NC/I/W order) the same way', () => {
    const p = parseUtdGradesCsv(text21f, { term: '2021-fa' });
    expect(p.rows.length + p.droppedRows).toBe(20);
    expect(p.rows[0]).toMatchObject({ subject: 'CS', number: '1134', yearTerm: '2021-fa', year: 2021, term: 'Fall', instructorRaw: 'Trevelyan, Hsin-Jung' });
    expect(p.rows[0].buckets).toMatchObject({ aPlus: 35, a: 8, bPlus: 2, b: 3, c: 1, f: 1, w: 1 });
  });
});

describe('UTD instructor parsing', () => {
  it('uses Instructor 1 as the primary and the rest as co-instructors', () => {
    expect(bySection('001').coInstructorsRaw).toEqual(['Ormerod, Gwendolyn']);
    expect(bySection('001').instructorNameNormalized).toBe('thaddeus ashdown');
    const six = bySection('012');
    expect(six.instructorRaw).toBe('Oyelaran, Wilhelmina L');
    expect(six.coInstructorsRaw).toHaveLength(5);
    expect(six.coInstructorsRaw[0]).toBe('Coventry, Seraphina L');
  });

  it('dedupes a co-instructor equal to the primary and handles empty instructor cells', () => {
    expect(bySection('013').coInstructorsRaw).toEqual([]);
    expect(bySection('008')).toMatchObject({ instructorRaw: '', coInstructorsRaw: [], instructorId: '', instructorNameNormalized: '' });
    expect(splitInstructors(['', 'Okonkwo, Adaeze', 'Okonkwo, Adaeze', ''])).toEqual({ primary: 'Okonkwo, Adaeze', coInstructors: [] });
  });

  it('collapses whitespace and keeps the real-world oddities the matcher understands', () => {
    expect(cleanInstructorCell('  Quillfeather,  Adaeze   (Ada) ')).toBe('Quillfeather, Adaeze (Ada)');
    expect(bySection('007').instructorRaw).toBe('Quillfeather, Adaeze (Ada)');
    expect(bySection('006').instructorRaw).toBe('Marisol Quintanar, .');
    expect(bySection('016').instructorRaw).toBe('Nerissa');
    expect(parseName('Ashdown, Thaddeus L')).toMatchObject({ last: 'ashdown', firstToken: 'thaddeus', middleInitials: ['l'] });
    expect(parseName('Quillfeather, Adaeze (Ada)')?.last).toBe('quillfeather');
    expect(parseName('Nerissa')).not.toBeNull();
  });
});

describe('UtdGradesCsvSource', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'profpeek-utd-'));
  writeFileSync(path.join(dir, 'enhanced_grades_enhanced_grades_25f.csv'), text25f);
  writeFileSync(path.join(dir, 'enhanced_grades_enhanced_grades_21f.csv'), text21f);
  writeFileSync(path.join(dir, 'enhanced_grades_enhanced_grades_17f.csv'), text21f); // outside the window
  writeFileSync(path.join(dir, 'Fall 2017.csv'), 'legacy'); // ignored
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('lists term files ascending and ignores other files', async () => {
    expect((await listUtdTermFiles(dir)).map((f) => f.term)).toEqual(['2017-fa', '2021-fa', '2025-fa']);
    expect(await listUtdTermFiles(path.join(dir, 'missing'))).toEqual([]);
  });

  it('concatenates in-window terms and merges excluded codes and dropped rows', async () => {
    const logs: string[] = [];
    const source = new UtdGradesCsvSource({ currentTerm: '2026-fa', yearsBack: 6, dir, log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) } });
    const res = await source.fetch({ schoolId: 'utd' });
    const p21 = parseUtdGradesCsv(text21f, { term: '2021-fa' });
    expect(res.terms).toEqual(['2021-fa', '2025-fa']);
    expect(res.rows).toHaveLength(197 + p21.rows.length);
    expect(res.droppedRows).toBe(3 + p21.droppedRows);
    expect(res.excludedGradeCodes.CR).toBe(parsed.excludedGradeCodes.CR + (p21.excludedGradeCodes.CR ?? 0));
    expect(res.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Set(res.rows.map((r) => r.yearTerm))).toEqual(new Set(['2021-fa', '2025-fa']));
    expect(logs.join('\n')).toMatch(/2 term files .*skipped 1 outside the window/);
    expect(source.info).toBe(UTD_GRADES_SOURCE_INFO);
    expect(source.info.license).toBe('MIT');
  });

  it('refuses other schools and explains a missing raw directory', async () => {
    const source = new UtdGradesCsvSource({ currentTerm: '2026-fa', yearsBack: 6, dir });
    await expect(source.fetch({ schoolId: 'uiuc' })).rejects.toThrowError(/only serves school "utd"/);
    const empty = new UtdGradesCsvSource({ currentTerm: '2026-fa', yearsBack: 6, dir: path.join(dir, 'nope') });
    await expect(empty.fetch({ schoolId: 'utd' })).rejects.toThrowError(/scripts\/fetch-utd\.ts/);
  });
});

describe('UTD registry entry and adapter kind', () => {
  it('registers kind utd-grades-csv', () => {
    expect(registeredAdapterKinds().grades).toContain('utd-grades-csv');
  });

  it('is a live, grades-only, counts-with-plus-minus school with inferred provenance', () => {
    expect(UTD.id).toMatch(SCHOOL_ID_RE);
    expect(UTD).toMatchObject({ mode: 'live', seatStatusAvailable: false, gradeBuckets: 'plus-minus', gradeValueKind: 'counts', timezone: 'America/Chicago' });
    expect(UTD.sources).toEqual({ grades: { kind: 'utd-grades-csv' }, schedule: null, reviews: null });
    expect(UTD.subjects).toEqual([...UTD_SUBJECTS]);
    expect(UTD_SUBJECTS).toHaveLength(20);
    expect(new Set(UTD_SUBJECTS).size).toBe(20);
    expect(UTD.attribution.grades).toMatch(/Texas Public Information Act/);
    expect(UTD.attribution.grades).toMatch(/inferred/);
    expect(UTD.attribution.grades).toMatch(/not been confirmed/);
    expect(UTD.attribution.schedule).toBeUndefined();
  });
});

describe('fetch-utd listing selection', () => {
  it('keeps only in-window term files, sorted, and skips legacy names', () => {
    const listing = [
      { name: 'Fall 2017.csv', size: 1, download_url: 'https://raw.example/Fall%202017.csv' },
      { name: 'enhanced_grades_enhanced_grades_25f.csv', size: 3, download_url: 'https://raw.example/25f.csv' },
      { name: 'enhanced_grades_enhanced_grades_17f.csv', size: 2, download_url: 'https://raw.example/17f.csv' },
      { name: 'enhanced_grades_enhanced_grades_20f.csv', size: 4, download_url: 'https://raw.example/20f.csv' },
      { name: 'enhanced_grades_enhanced_grades_20u.csv', size: 5, download_url: 'https://raw.example/20u.csv' },
      { name: 'matched_professor_data.json', size: 6, download_url: null },
    ];
    expect(selectTermFiles(listing, '2026-fa', 6).map((f) => `${f.term}:${f.size}`)).toEqual(['2020-fa:4', '2025-fa:3']);
    expect(USER_AGENT).toMatch(/^ProfPeek\/1\.0 \(\+https:\/\/github\.com\//);
    expect(() => selectTermFiles([{ name: 1 }], '2026-fa', 6)).toThrow();
  });
});
