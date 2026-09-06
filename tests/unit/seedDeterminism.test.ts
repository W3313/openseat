// SPEC 12.3 — seedDeterminism: two in-memory runs give identical bytes; hash equals
// data/raw/demo/uiuc/seed-hash.txt; every deliberate edge case in meta.edgeCases exists in the output.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import type { TermCode } from '@/lib/domain/types';
import type { RawProfessor, RawReview, RawSection } from '@/lib/sources/types';
import { instructorKeyFromRaw } from '@/lib/utils/hash';
import {
  EDGE_CASE_IDS, SEED_FILE_ORDER, SEED_HASH_FILE, generateDemoSeed, loadSeedConfig, seedHash, seedOptionsFrom, serializeSeed,
} from '@/lib/sources/demo/generator';
import type { EdgeCaseRecord, SeedMeta, SeedOptions } from '@/lib/sources/demo/generator';
import { FRAGMENT_COUNT, REVIEW_MAX_CHARS, REVIEW_MIN_CHARS } from '@/lib/sources/demo/reviewGrammar';
import { GPA_CSV_HEADER } from '@/lib/sources/demo/generator-types';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = path.join(ROOT, 'data', 'raw', 'demo', 'uiuc');

type CsvRow = Record<string, string>;

interface Loaded {
  options: SeedOptions;
  meta: SeedMeta;
  files: Record<(typeof SEED_FILE_ORDER)[number], string>;
  hash: string;
  csv: CsvRow[];
  professors: RawProfessor[];
  reviews: RawReview[];
  sections: RawSection[];
}

let cached: Promise<Loaded> | null = null;

/** Regenerate in memory with the runtime knobs recorded in the committed meta.json. */
function load(): Promise<Loaded> {
  cached ??= (async () => {
    const committedMeta = JSON.parse(await readFile(path.join(OUT_DIR, 'meta.json'), 'utf8')) as SeedMeta;
    const config = await loadSeedConfig(ROOT);
    const options = seedOptionsFrom(config, {
      seed: committedMeta.seed, currentTerm: committedMeta.currentTerm as TermCode, subjects: committedMeta.subjects,
    });
    const result = generateDemoSeed(options);
    const files = serializeSeed(result);
    return {
      options, meta: result.meta, files, hash: seedHash(files),
      csv: parse(files['gpa.csv'], { columns: true, skip_empty_lines: true }) as CsvRow[],
      professors: result.professors, reviews: result.reviews, sections: result.sections,
    };
  })();
  return cached;
}

function edge(meta: SeedMeta, id: EdgeCaseRecord['id']): EdgeCaseRecord['details'] {
  const record = meta.edgeCases.find((e) => e.id === id);
  if (!record) throw new Error(`edge case ${id} missing`);
  return record.details;
}

const instructorsOf = (rows: CsvRow[]): string[] => rows.map((r) => r['Primary Instructor']);
const rowsNaming = (rows: CsvRow[], needle: string): CsvRow[] => rows.filter((r) => r['Primary Instructor'] === needle);

describe('seed determinism (SPEC 6.5 / 12.3)', () => {
  it('two in-memory runs produce identical bytes and hash', async () => {
    const { options, files, hash } = await load();
    const again = serializeSeed(generateDemoSeed(options));
    for (const name of SEED_FILE_ORDER) expect(again[name]).toBe(files[name]);
    expect(seedHash(again)).toBe(hash);
  });

  it('matches the committed data/raw/demo/uiuc output and seed-hash.txt', async () => {
    const { files, hash } = await load();
    const committedHash = (await readFile(path.join(OUT_DIR, SEED_HASH_FILE), 'utf8')).trim();
    expect(hash).toBe(committedHash);
    for (const name of SEED_FILE_ORDER) {
      expect(await readFile(path.join(OUT_DIR, name), 'utf8')).toBe(files[name]);
    }
  });

  it('writes the exact 23-column gpa.csv shape with consistent totals', async () => {
    const { files, csv, meta } = await load();
    const header = files['gpa.csv'].split('\n')[0].split(',');
    expect(header).toEqual([...GPA_CSV_HEADER]);
    expect(header).toHaveLength(23);
    expect(csv).toHaveLength(meta.gradeRowCount);
    for (const row of csv) {
      expect(Object.keys(row)).toHaveLength(23);
      const buckets = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'W'].reduce((n, k) => n + Number(row[k]), 0);
      expect(Number(row.Students)).toBe(buckets);
      expect(row.YearTerm).toMatch(/^\d{4}-(fa|sp|su|wi)$/);
    }
    expect(csv.some((r) => Number(r.Students) - Number(r.W) < 10)).toBe(true); // suppression material
  });

  it('never uses a real instructor key or a blocked surname', async () => {
    const { options, csv, professors } = await load();
    const raws = new Set([...instructorsOf(csv), ...professors.map((p) => `${p.lastName}, ${p.firstName}`)]);
    for (const raw of raws) {
      if (raw === '' || raw === 'Staff') continue;
      const key = instructorKeyFromRaw(raw);
      expect(key, raw).not.toBeNull();
      expect(options.realInstructorKeys.has(key!), raw).toBe(false);
    }
    expect(professors.every((p) => p.isFictional)).toBe(true);
  });

  it('reviews stay within 60–400 chars and the grammar has ≈ 300 fragments', async () => {
    const { reviews } = await load();
    expect(FRAGMENT_COUNT).toBeGreaterThanOrEqual(280);
    for (const r of reviews) {
      expect(r.text.length).toBeGreaterThanOrEqual(REVIEW_MIN_CHARS);
      expect(r.text.length).toBeLessThanOrEqual(REVIEW_MAX_CHARS);
      expect(r.quality).toBeGreaterThanOrEqual(1);
      expect(r.quality).toBeLessThanOrEqual(5);
    }
    expect(reviews.length).toBeGreaterThan(1000);
  });

  it('records every deliberate edge case (a)–(l) in meta.edgeCases', async () => {
    const { meta } = await load();
    expect(meta.edgeCases.map((e) => e.id)).toEqual([...EDGE_CASE_IDS]);
  });

  it('(a)/(b) surname collisions exist among reviewed professors', async () => {
    const { meta, csv, professors } = await load();
    const a = edge(meta, 'a');
    const pa = professors.filter((p) => (a.professors as string[]).includes(p.sourceId));
    expect(pa).toHaveLength(2);
    expect(pa[0].lastName).toBe(pa[1].lastName);
    expect(pa[0].firstName.charAt(0)).not.toBe(pa[1].firstName.charAt(0));

    const b = edge(meta, 'b');
    const pb = professors.filter((p) => (b.professors as string[]).includes(p.sourceId));
    expect(pb).toHaveLength(2);
    expect(pb[0].lastName).toBe(pb[1].lastName);
    expect(pb[0].firstName.charAt(0)).toBe(pb[1].firstName.charAt(0));
    expect(pb[0].firstName).not.toBe(pb[1].firstName);
    expect(rowsNaming(csv, b.ambiguousRaw as string).length).toBeGreaterThan(0);
    const initialOnly = professors.find((p) => p.sourceId === b.initialOnlyProfessor)!;
    expect(rowsNaming(csv, `${initialOnly.lastName}, ${initialOnly.firstName}`)).toHaveLength(0);
  });

  it('(c)–(f) name variants appear in grade rows alongside the canonical string', async () => {
    const { meta, csv } = await load();
    for (const id of ['c', 'd', 'e', 'f'] as const) {
      const d = edge(meta, id);
      expect(d.variant).not.toBe(d.canonical);
      expect(rowsNaming(csv, d.variant as string).length, `${id} variant ${d.variant}`).toBeGreaterThan(0);
      expect(rowsNaming(csv, d.canonical as string).length, `${id} canonical ${d.canonical}`).toBeGreaterThan(0);
    }
    expect(edge(meta, 'e').variant).toMatch(/, Bob$/);
    expect(edge(meta, 'f').variant).toMatch(/ Jr$/);
  });

  it('(g) grades-only instructors have rows but no review record', async () => {
    const { meta, csv, professors } = await load();
    const g = edge(meta, 'g');
    const names = g.instructors as string[];
    expect(names).toHaveLength(5);
    expect(g.subjects).toEqual(['CS', 'ECE', 'MATH', 'PHYS', 'STAT']);
    for (const raw of names) {
      expect(rowsNaming(csv, raw).length, raw).toBeGreaterThan(0);
      expect(professors.some((p) => `${p.lastName}, ${p.firstName}` === raw)).toBe(false);
    }
  });

  it('(h) a reviewed professor with an open section has zero grade rows', async () => {
    const { meta, csv, professors, reviews, sections } = await load();
    const h = edge(meta, 'h');
    const prof = professors.find((p) => p.sourceId === h.professor)!;
    expect(prof).toBeDefined();
    expect(reviews.filter((r) => r.professorSourceId === prof.sourceId).length).toBeGreaterThanOrEqual(3);
    expect(csv.filter((r) => r['Primary Instructor'].startsWith(`${prof.lastName},`))).toHaveLength(0);
    expect(sections.some((s) => s.statusCode === 'open' && s.instructorsRaw.some((i) => i.startsWith(`${prof.lastName},`)))).toBe(true);
  });

  it('(i) one "Staff" row and one empty-instructor row per subject', async () => {
    const { meta, csv } = await load();
    for (const subject of meta.subjects) {
      const inSubject = csv.filter((r) => r.Subject === subject);
      expect(rowsNaming(inSubject, 'Staff')).toHaveLength(1);
      expect(rowsNaming(inSubject, '')).toHaveLength(1);
    }
  });

  it('(j)–(l) co-taught, cross-listed and zero-open-section cases exist in sections.json', async () => {
    const { meta, sections } = await load();
    const j = edge(meta, 'j');
    const co = sections.filter((s) => s.crn === j.crn);
    expect(co).toHaveLength(1);
    expect(co[0].instructorsRaw).toHaveLength(2);

    const k = edge(meta, 'k');
    const cross = sections.filter((s) => s.crn === k.crn);
    expect(cross).toHaveLength(2);
    expect(new Set(cross.map((s) => `${s.subject}:${s.number}`)).size).toBe(2);
    expect(cross.map((s) => s.subject).sort()).toEqual(['CS', 'ECE']);
    expect(cross.every((s) => Number(s.number) >= 400)).toBe(true);

    const l = edge(meta, 'l');
    const [, subject, number] = (l.courseId as string).split(':');
    const forCourse = sections.filter((s) => s.subject === subject && s.number === number);
    expect(forCourse.length).toBeGreaterThan(0);
    expect(forCourse.some((s) => s.statusCode === 'open')).toBe(false);

    for (const s of sections) expect(s.seatsKnown).toBe(true);
    expect(sections.filter((s) => s.statusCode === 'open').length).toBe(meta.openSectionCount);
  });
});
