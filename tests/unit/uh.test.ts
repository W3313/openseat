// University of Houston adapters (MULTI_SCHOOL_DESIGN §4.2 row `uh`, §7): records.csv parser (header,
// A–F/TOTAL DROPPED bucket mapping, SATISFACTORY / NOT REPORTED exclusion, "Last, First" joining,
// co-taught splitting, term parsing, window), the Class Browser parsers + source (pagination, status,
// meetings), the release-bundle tar reader, the registry entry and the SchoolConfig.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { UH, UH_SUBJECTS } from '@/lib/config/schools/uh';
import { parseName } from '@/lib/matching';
import { registeredAdapterKinds } from '@/lib/sources/registry';
import '@/lib/sources/uh/register';
import { extractTarEntries, extractTarGzEntries, parseReleaseJson } from '@/lib/sources/uh/bundle';
import {
  normalizeInstructorName, parseBuilding, parseClassClock, parseClassRecord, parseDayTokens, parseSubjectsJson, parseTermsJson, statusCodeFor, termCodeFor,
} from '@/lib/sources/uh/parseClassBrowser';
import {
  UH_RECORDS_COLUMNS, UhCsvRowError, UhCsvSchemaError, filterUhGradeWindow, joinInstructorName, parseUhRecordsCsv, parseUhTerm, splitCount, validateUhRecordsHeader, scopeUhBookkeeping } from '@/lib/sources/uh/parseRecordsCsv';
import { UhClassBrowserSource } from '@/lib/sources/uh/UhClassBrowserSource';
import { UhCougarGradesSource } from '@/lib/sources/uh/UhCougarGradesSource';
import { mapSectionStatus } from '../../scripts/ingest/sections';

const fx = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name);
const CSV = readFileSync(fx('uh-records-sample.csv'), 'utf8');
const source = parse(CSV, { columns: true, bom: true, trim: true }) as Record<string, string>[];
const TERMS = JSON.parse(readFileSync(fx('uh-classbrowser-terms.json'), 'utf8')) as unknown;
const PAGE1 = JSON.parse(readFileSync(fx('uh-classbrowser-COSC.page1.json'), 'utf8')) as { data: unknown[] };
const PAGE2 = JSON.parse(readFileSync(fx('uh-classbrowser-COSC.page2.json'), 'utf8')) as { data: unknown[] };
const parsed = parseUhRecordsCsv(CSV);
const byKey = (term: string, subject: string, number: string, section: string) =>
  parsed.rows.filter((r) => r.yearTerm === term && r.subject === subject && r.number === number && r.section === section);

describe('records.csv header', () => {
  it('has the exact 16 upstream columns', () => {
    expect(UH_RECORDS_COLUMNS).toHaveLength(16);
    expect(CSV.split('\n')[0]).toBe(UH_RECORDS_COLUMNS.join(','));
    expect(validateUhRecordsHeader([...UH_RECORDS_COLUMNS, 'Extra'])).toEqual(['Extra']);
  });
  it('names the missing column and rejects an empty file', () => {
    expect(() => parseUhRecordsCsv(CSV.replace('TOTAL DROPPED', 'DROPPED'))).toThrowError(UhCsvSchemaError);
    expect(() => parseUhRecordsCsv(CSV.replace('INSTR FIRST NAME', 'FIRST'))).toThrowError(/"INSTR FIRST NAME"/);
    expect(() => parseUhRecordsCsv('')).toThrowError(UhCsvSchemaError);
    expect(() => parseUhRecordsCsv(CSV.replace(',16,47,15,8,8,45', ',16,x,15,8,8,45'))).toThrowError(UhCsvRowError);
    expect(() => parseUhRecordsCsv(CSV.replace('Fall 2013,', 'Autumn13,'))).toThrowError(/TERM "Autumn13"/);
  });
});

describe('records.csv rows', () => {
  it('emits one row per (section, instructor): source − merged duplicates − empty rows', () => {
    expect(source).toHaveLength(202);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(source.length - parsed.mergedDuplicateRows - parsed.droppedRows);
    expect(parsed.mergedDuplicateRows).toBeGreaterThanOrEqual(1);
    for (const r of parsed.rows) {
      expect(r.students).toBe(Object.values(r.buckets).reduce((a, b) => a + b, 0));
      expect(r.students).toBeGreaterThan(0);
      expect(r.schedType).toBe('');
      expect('percentOnly' in r).toBe(false); // counts, never percentages (§4.1 does not apply)
    }
  });

  it('maps A–F to the plain buckets, TOTAL DROPPED to w, blanks to 0 and AVG GPA to sourceGpa', () => {
    const [row] = byKey('2025-fa', 'MATH', '3333', '04');
    expect(row).toMatchObject({ year: 2025, term: 'Fall', title: 'Intermediate Analysis', instructorRaw: 'Karenva, Osthoqui R', sourceGpa: 2.838, coInstructors: 1 });
    expect(row.buckets).toEqual({ aPlus: 0, a: 14, aMinus: 0, bPlus: 0, b: 13, bMinus: 0, cPlus: 0, c: 5, cMinus: 0, dPlus: 0, d: 2, dMinus: 0, f: 3, w: 0 });
    expect(row.students).toBe(37);
    const [blankF] = byKey('2025-fa', 'MATH', '6397', '05');
    expect(blankF.buckets.f).toBe(0);
    const withDrops = parsed.rows.find((r) => r.subject === 'HISP' && r.number === '2375');
    expect(withDrops?.buckets.w).toBe(2);
    const mini = parseUhRecordsCsv(`${UH_RECORDS_COLUMNS.join(',')}\nSpring 2024,COSC,1336,1,Computer Science & Program,Varenthos,Milo,5,4,3,2,1,0,0,,\n`);
    expect(mini.rows[0]).toMatchObject({ sourceGpa: null, students: 15, instructorRaw: 'Varenthos, Milo', yearTerm: '2024-sp' });
    expect(mini.rows[0].buckets.w).toBe(0);
    const dropsOnly = parseUhRecordsCsv(`${UH_RECORDS_COLUMNS.join(',')}\nSpring 2024,MATH,1100,1,Precalculus Lab,Varenthos,Milo,0,0,0,0,0,0,0,15,0\n`);
    expect(dropsOnly.rows[0]).toMatchObject({ sourceGpa: null, students: 15, buckets: expect.objectContaining({ w: 15 }) }); // "0" AVG GPA without letters is not a GPA
  });

  it('excludes SATISFACTORY / NOT REPORTED from graded and counts their rows; drops rows with no letters and no drops', () => {
    const count = (col: string) => source.filter((r) => Number(r[col] || 0) > 0).length;
    expect(parsed.excludedGradeCodes).toEqual({ SATISFACTORY: count('SATISFACTORY'), 'NOT REPORTED': count('NOT REPORTED') });
    expect(parsed.excludedGradeCodes['NOT REPORTED']).toBeGreaterThanOrEqual(2);
    const engl = parsed.rows.find((r) => r.subject === 'ENGL' && r.number === '2360');
    expect(engl?.students).toBe(81 + 48 + 3 + 1); // 29 satisfactory + 1 not reported are not students in the buckets
    expect(parsed.rows.some((r) => r.subject === 'COMM' && r.number === '4392')).toBe(false); // SATISFACTORY only
    expect(parsed.rows.some((r) => r.subject === 'ENGL' && r.number === '8699')).toBe(false); // all blank
    expect(parsed.droppedRows).toBeGreaterThanOrEqual(2);
  });

  it('keeps blank-instructor rows for course baselines and upper-cases letter catalog numbers', () => {
    const blank = parsed.rows.filter((r) => r.instructorRaw === '');
    expect(blank.map((r) => `${r.subject} ${r.number} ${r.section}`)).toEqual(['COSC 1336 7', 'MATH 1314 12']);
    expect(blank[0].students).toBe(74);
    expect(parsed.rows.some((r) => r.number === '6A25' && r.subject === 'MANA')).toBe(true);
  });

  it('joins "Last" + "First M." into "Last, First M." and keeps suffixes, apostrophes, hyphens and multi-word names', () => {
    expect(joinInstructorName(' Quine Jr ', 'Thonene  T')).toBe('Quine Jr, Thonene T');
    expect(joinInstructorName('Solo', '')).toBe('Solo');
    expect(joinInstructorName('', 'Orphan')).toBe('Orphan');
    expect(joinInstructorName('', '')).toBe('');
    const raws = new Set(parsed.rows.map((r) => r.instructorRaw));
    for (const raw of ['Quine Jr, Thonene T', "O'Osbri, Ulci", 'Zone-Thosha, Kaquine M', 'Irmil Daxci, Milos Cika', 'Daxir, Renquibri D.', 'Baferwen, Daxtho-Fer Moekyo']) {
      expect(raws.has(raw), raw).toBe(true);
      expect(parseName(raw), raw).not.toBeNull();
    }
    expect(parseName('Quine Jr, Thonene T')?.firstToken).toBe('thonene');
    expect(parseName('Irmil Daxci, Milos Cika')?.lastCompact).toBe('irmildaxci');
  });

  it('splits a co-taught section (identical rows per instructor) with largest-remainder rounding', () => {
    expect(splitCount(10, 3)).toEqual([4, 3, 3]);
    expect(splitCount(5, 1)).toEqual([5]);
    expect(splitCount(0, 2)).toEqual([0, 0]);
    const biol = byKey('2020-fa', 'BIOL', '3306', '1');
    expect(biol.map((r) => r.instructorRaw)).toEqual(['Kazo, Yopri', 'Kayobri, Renzoqui C']);
    expect(biol.map((r) => [r.buckets.a, r.buckets.b, r.buckets.c, r.buckets.d, r.buckets.f, r.buckets.w])).toEqual([[8, 24, 8, 4, 4, 3], [8, 23, 7, 4, 4, 3]]);
    expect(biol.map((r) => r.students)).toEqual([51, 49]); // 94 graded + 6 dropped, exactly once
    expect(biol.every((r) => r.coInstructors === 2 && r.sourceGpa === 1.651)).toBe(true);
    const band = byKey('2020-fa', 'MUSI', '1100', '1');
    expect(band).toHaveLength(3);
    expect(band.map((r) => r.buckets.a)).toEqual([32, 32, 32]);
    expect(band.map((r) => r.buckets.w)).toEqual([2, 1, 1]);
    expect(parsed.coTaughtSections).toBeGreaterThanOrEqual(2);
  });

  it('keeps rows that repeat a section with different counts and collapses exact duplicates', () => {
    const comd = byKey('2020-fa', 'COMD', '6372', '1');
    expect(comd.map((r) => [r.instructorRaw, r.students])).toEqual([['Youlpri, Ulren L', 10], ['Youlpri, Ulren L', 24]]);
    const lines = CSV.split('\n').filter(Boolean);
    const dup = lines.find((l, i) => lines.indexOf(l) !== i)!;
    const [term, subject, number, section] = dup.split(',');
    expect(byKey(parseUhTerm(term)!, subject, number, section)).toHaveLength(1);
  });

  it('parses "<Season> <Year>" terms and applies the grade window', () => {
    expect(parseUhTerm('Fall 2013')).toBe('2013-fa');
    expect(parseUhTerm('Summer 2019')).toBe('2019-su');
    expect(parseUhTerm('Spring 2026')).toBe('2026-sp');
    expect(parseUhTerm('Fall2013')).toBeNull();
    expect(parseUhTerm('2026')).toBeNull();
    const old = parsed.rows.filter((r) => r.yearTerm === '2013-fa' || r.yearTerm === '2019-su');
    expect(old).toHaveLength(3);
    const { kept, discarded } = filterUhGradeWindow(parsed.rows, '2026-fa', 6);
    expect(discarded).toBe(3);
    expect(kept.length + discarded).toBe(parsed.rows.length);
    expect(kept.some((r) => r.yearTerm === '2020-fa')).toBe(true); // ordinal 20203 = window start
    expect(kept[0].sourceGpa !== undefined).toBe(true); // the generic filter keeps the UH row type
  });
});

describe('UhCougarGradesSource', () => {
  it('serves only uh, reads the CSV and returns the §4 extras', async () => {
    const log = { info: () => {}, warn: () => {} };
    const src = new UhCougarGradesSource({ currentTerm: '2026-fa', yearsBack: 6, csvPath: fx('uh-records-sample.csv'), log });
    expect(src.info.id).toBe('uh-cougargrades');
    expect(src.info.license).toMatch(/MIT/);
    const res = await src.fetch({ schoolId: 'uh' });
    expect(res.rows).toHaveLength(parsed.rows.length - 3);
    // §4 bookkeeping is scoped to the grade window (row counts over in-window terms only).
    const scoped = scopeUhBookkeeping(parsed, '2026-fa', 6);
    expect(res.excludedGradeCodes).toEqual(scoped.excludedGradeCodes);
    expect(res.droppedRows).toBe(scoped.droppedRows);
    expect(Object.values(parsed.excludedByTerm).reduce((acc, t) => acc + t.SATISFACTORY, 0)).toBe(parsed.excludedGradeCodes.SATISFACTORY);
    expect(Object.values(parsed.droppedByTerm).reduce((a, b) => a + b, 0)).toBe(parsed.droppedRows);
    expect(res.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(src.fetch({ schoolId: 'uiuc' })).rejects.toThrow(/only serves school "uh"/);
    const missing = new UhCougarGradesSource({ currentTerm: '2026-fa', yearsBack: 6, csvPath: fx('nope.csv'), log });
    await expect(missing.fetch({ schoolId: 'uh' })).rejects.toThrow(/fetch-uh/);
  });
});

describe('Class Browser parsers', () => {
  it('maps term descriptions to PeopleSoft codes', () => {
    const terms = parseTermsJson(TERMS);
    expect(terms.map((t) => t.code)).toEqual(['0495', '2250', '2270', '2280', '2290', '2300', '2310']); // "Not A Term" skipped, sorted
    expect(termCodeFor(terms, '2026-fa')).toBe('2300');
    expect(termCodeFor(terms, '2026-su')).toBe('2290');
    expect(termCodeFor(terms, '2030-fa')).toBeNull();
    expect(parseSubjectsJson({ data: [{ subject: 'cosc' }, { subject: 'MATH' }] })).toEqual(['COSC', 'MATH']);
  });

  it('parses day tokens, clocks, buildings and names', () => {
    expect(parseDayTokens(' TuTh 10:00 AM-11:30 AM')).toEqual(['T', 'R']);
    expect(parseDayTokens('MoWeFr 09:00 AM-10:00 AM')).toEqual(['M', 'W', 'F']);
    expect(parseDayTokens('SaSu 09:00 AM-10:00 AM')).toEqual(['S', 'U']);
    expect(parseDayTokens('  -')).toEqual([]);
    expect(parseDayTokens(null)).toEqual([]);
    expect(parseClassClock('10:00:00')).toBe('10:00');
    expect(parseClassClock('17:30:00')).toBe('17:30');
    expect(parseClassClock('9:05')).toBe('09:05');
    expect(parseClassClock('25:00:00')).toBeNull();
    expect(parseClassClock(null)).toBeNull();
    expect(parseBuilding('SR2 130')).toEqual({ building: 'SR2', room: '130' });
    expect(parseBuilding('ONLINE')).toEqual({ building: 'ONLINE', room: null });
    expect(parseBuilding('TBA')).toEqual({ building: null, room: null });
    expect(parseBuilding(null)).toEqual({ building: null, room: null });
    expect(normalizeInstructorName('Yun,Changhoon')).toBe('Yun, Changhoon');
    expect(normalizeInstructorName('Rincon Castro,Carlos Alberto')).toBe('Rincon Castro, Carlos Alberto');
    expect(normalizeInstructorName('Solo,')).toBe('Solo');
    expect(normalizeInstructorName('  ')).toBeNull();
    expect(normalizeInstructorName(null)).toBeNull();
  });

  it('maps class_stat + enrl_stat to the codes ingest understands (seatStatusAvailable)', () => {
    const cases: [string, string, string, string][] = [
      ['A', 'O', 'open', 'open'], ['A', 'C', 'closed', 'closed'], ['A', 'W', 'waitlist', 'waitlist'], ['S', 'C', 'closed', 'closed'],
      ['T', 'O', 'inactive', 'inactive'], ['X', 'C', 'inactive', 'inactive'], ['A', '', '', 'unknown'],
    ];
    for (const [cs, es, code, status] of cases) {
      expect(statusCodeFor(cs, es), `${cs}/${es}`).toBe(code);
      expect(mapSectionStatus(code), `${cs}/${es}`).toBe(status);
    }
  });

  it('turns course records into RawSections', () => {
    const all = [...PAGE1.data, ...PAGE2.data].map((r) => parseClassRecord(r, { subject: 'COSC' })!);
    const byCrn = Object.fromEntries(all.map((s) => [s.crn, s]));
    expect(all).toHaveLength(16);
    expect(byCrn['16503']).toMatchObject({ crn: '16503', subject: 'COSC', number: '1336', sectionCode: '03', statusCode: 'open', seatsKnown: true, instructorsRaw: ['Varenthos, Milo'] });
    expect(byCrn['16503'].meetings).toEqual([{ days: ['T', 'R'], start: '10:00', end: '11:30', building: 'SR2', room: '130', type: 'LEC' }]);
    expect(byCrn['13422'].statusCode).toBe('closed');
    expect(byCrn['14320'].meetings[0]).toEqual({ days: [], start: null, end: null, building: null, room: null, type: 'IND' });
    expect(byCrn['19901'].meetings[0]).toMatchObject({ days: [], start: null, end: null, building: null }); // "12:00 AM-12:00 AM" = arranged
    expect(byCrn['19902'].statusCode).toBe('inactive'); // tentative
    expect(byCrn['19903'].statusCode).toBe('closed'); // stop further enrollment
    expect(byCrn['19904'].statusCode).toBe('inactive'); // cancelled
    expect(byCrn['19905'].statusCode).toBe('waitlist');
    expect(byCrn['19906'].instructorsRaw).toEqual([]);
    expect(byCrn['19907'].meetings[0]).toMatchObject({ building: 'ONLINE', room: null });
    expect(byCrn['19908']).toMatchObject({ number: '4A97', meetings: [{ days: ['R'], start: '17:30', end: '20:30', building: 'PGH', room: '232' }] });
    expect(parseClassRecord({ subject: 'COSC' }, { subject: 'COSC' })).toBeNull();
  });
});

describe('UhClassBrowserSource', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  function makeSource(opts: { failFirst?: boolean } = {}) {
    const calls: { url: string; init?: RequestInit }[] = [];
    let failed = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (opts.failFirst && !failed) {
        failed = true;
        return json({ message: 'boom' }, 503);
      }
      if (url.endsWith('/terms')) return json(TERMS);
      if (url.endsWith('/courses')) return json(PAGE1);
      if (url.endsWith('/courses?page=2')) return json(PAGE2);
      return json({ message: 'not found' }, 404);
    };
    const src = new UhClassBrowserSource({
      useCache: false, fetchImpl, sleep: async () => {}, now: () => new Date('2026-09-06T12:00:00Z'), perPage: 10, delayMs: 0,
      log: { info: () => {}, warn: () => {} },
    });
    return { src, calls };
  }

  it('resolves the term code, POSTs JSON pages with the ProfPeek User-Agent and concatenates them', async () => {
    const { src, calls } = makeSource();
    const res = await src.fetchSections({ schoolId: 'uh', term: '2026-fa', subject: 'cosc' });
    expect(res.term).toBe('2026-fa');
    expect(res.fetchedAt).toBe('2026-09-06T12:00:00.000Z');
    expect(res.sections).toHaveLength(16);
    expect(res.sections.map((s) => s.crn)).toContain('19908');
    expect(calls.map((c) => c.url)).toEqual([
      'https://classbrowser.uh.edu/api/terms', 'https://classbrowser.uh.edu/api/courses', 'https://classbrowser.uh.edu/api/courses?page=2',
    ]);
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ term: '2300', subject: 'COSC', per_page: 10 });
    expect((calls[1].init?.headers as Record<string, string>)['user-agent']).toMatch(/^ProfPeek\/1\.0 /);
    expect(src.stats).toEqual({ requests: 3, cacheHits: 0, retries: 0 });
  });

  it('retries a 5xx, refuses other schools and unknown terms', async () => {
    const { src } = makeSource({ failFirst: true });
    const res = await src.fetchSections({ schoolId: 'uh', term: '2026-fa', subject: 'COSC' });
    expect(res.sections).toHaveLength(16);
    expect(src.stats.retries).toBe(1);
    await expect(src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).rejects.toThrow(/only serves "uh"/);
    await expect(src.fetchSections({ schoolId: 'uh', term: '2030-fa', subject: 'COSC' })).rejects.toThrow(/does not list term 2030-fa/);
    expect(src.info).toMatchObject({ id: 'uh-classbrowser', license: null });
  });
});

describe('release bundle helpers', () => {
  const tarOf = (entries: { name: string; body: string; pax?: string }[]): Buffer => {
    const blocks: Buffer[] = [];
    const header = (name: string, size: number, type: string) => {
      const h = Buffer.alloc(512);
      h.write(name, 0, 100, 'utf8');
      h.write('0000644\0', 100);
      h.write(size.toString(8).padStart(11, '0') + '\0', 124);
      h.write(type, 156);
      h.write('ustar\0', 257);
      h.write('00', 263);
      return h;
    };
    const push = (name: string, body: Buffer, type: string) => {
      blocks.push(header(name, body.length, type), body, Buffer.alloc((512 - (body.length % 512)) % 512));
    };
    for (const e of entries) {
      if (e.pax) {
        const rec = ` path=${e.pax}\n`;
        const len = String(rec.length + String(rec.length + 2).length);
        push('././@PaxHeader', Buffer.from(`${len}${rec}`), 'x');
      }
      push(e.name, Buffer.from(e.body), '0');
    }
    blocks.push(Buffer.alloc(1024));
    return Buffer.concat(blocks);
  };

  it('extracts wanted entries from ustar / pax tars and gzipped bundles', () => {
    const tar = tarOf([
      { name: 'edu.uh.grade_distribution/records.csv', body: 'TERM,SUBJECT\nFall 2025,COSC\n' },
      { name: 'other/file.txt', body: 'skip me' },
      { name: 'short', body: '{"COSC":"Computer Science"}', pax: 'edu.uh.publications.subjects/subjects.json' },
    ]);
    const wanted = new Set(['edu.uh.grade_distribution/records.csv', 'edu.uh.publications.subjects/subjects.json']);
    const got = extractTarEntries(tar, wanted);
    expect([...got.keys()].sort()).toEqual([...wanted].sort());
    expect(got.get('edu.uh.grade_distribution/records.csv')?.toString('utf8')).toBe('TERM,SUBJECT\nFall 2025,COSC\n');
    expect(JSON.parse(got.get('edu.uh.publications.subjects/subjects.json')!.toString('utf8'))).toEqual({ COSC: 'Computer Science' });
    expect(extractTarGzEntries(gzipSync(tar), wanted).size).toBe(2);
  });

  it('picks the bundle asset out of the GitHub release payload', () => {
    const rel = parseReleaseJson({
      tag_name: '2026-08-15-224743', published_at: '2026-08-15T22:47:43Z', html_url: 'https://github.com/cougargrades/publicdata/releases/tag/x',
      assets: [{ name: 'database.tar.gz', browser_download_url: 'https://example.invalid/db' }, { name: 'publicdata-bundle.tar.gz', browser_download_url: 'https://example.invalid/bundle', size: 12118452 }],
    });
    expect(rel).toEqual({ tag: '2026-08-15-224743', publishedAt: '2026-08-15T22:47:43Z', htmlUrl: 'https://github.com/cougargrades/publicdata/releases/tag/x', asset: { name: 'publicdata-bundle.tar.gz', url: 'https://example.invalid/bundle', size: 12118452 } });
    expect(() => parseReleaseJson({ tag_name: 'v0', assets: [] })).toThrow(/no asset named publicdata-bundle.tar.gz/);
  });
});

describe('registry entry and SchoolConfig', () => {
  it('registers the uh adapter kinds', () => {
    const kinds = registeredAdapterKinds();
    expect(kinds.grades).toContain('uh-cougargrades');
    expect(kinds.schedule).toContain('uh-classbrowser');
  });
  it('describes UH as a live, grades-only school with seat status and plain letters + W', () => {
    expect(UH).toMatchObject({ id: 'uh', shortName: 'UH', mode: 'live', timezone: 'America/Chicago', seatStatusAvailable: true, gradeBuckets: 'letter-with-w', gradeValueKind: 'counts' });
    expect(UH.sources).toEqual({ grades: { kind: 'uh-cougargrades' }, schedule: { kind: 'uh-classbrowser' }, reviews: null });
    expect(UH.subjects).toEqual([...UH_SUBJECTS]);
    expect(UH_SUBJECTS.length).toBeGreaterThanOrEqual(15);
    expect(UH_SUBJECTS.length).toBeLessThanOrEqual(20);
    expect(new Set(UH_SUBJECTS).size).toBe(UH_SUBJECTS.length);
    expect(UH_SUBJECTS).toEqual(expect.arrayContaining(['MATH', 'BIOL', 'CHEM', 'COSC']));
    expect(UH.attribution.grades).toMatch(/Texas Public Information Act/);
    expect(UH.attribution.grades).toMatch(/cougargrades\/publicdata/);
    expect(UH.attribution.schedule).toMatch(/classbrowser\.uh\.edu/);
  });
});
