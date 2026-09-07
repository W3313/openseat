// MULTI_SCHOOL_DESIGN §3 / §6: every data/processed/<school> directory follows the per-subject layout, is
// compact JSON, and stays inside the size budgets exported by scripts/build-rankings.ts (the measured
// headroom around the §6 targets — see the comment there).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGISTERED_SCHOOL_IDS } from '@/lib/config/schools';
import { MAX_DETAIL_FILE_BYTES, MAX_RANKINGS_FILE_BYTES, MAX_SCHOOL_BYTES } from '../../scripts/build-rankings';

const PROCESSED = path.join(process.cwd(), 'data', 'processed');
const schools = readdirSync(PROCESSED, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function dirBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(full) : statSync(full).size;
  }
  return total;
}

const jsonNames = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : []);

describe('data/processed layout', () => {
  it('has the demo school and only registered school ids', () => {
    expect(schools).toContain('demo');
    for (const s of schools) expect(REGISTERED_SCHOOL_IDS, `unregistered directory ${s}`).toContain(s);
  });
});

describe.each(schools)('data/processed/%s', (school) => {
  const dir = path.join(PROCESSED, school);
  const subjects = (JSON.parse(readFileSync(path.join(dir, 'subjects.json'), 'utf8')) as { code: string }[]).map((s) => s.code).sort();

  it('mirrors subjects.json in grades/, rankings/ and professors-detail/ and has no legacy single files', () => {
    expect(subjects.length).toBeGreaterThan(0);
    expect(jsonNames(path.join(dir, 'grades'))).toEqual(subjects);
    expect(jsonNames(path.join(dir, 'rankings'))).toEqual(subjects);
    expect(jsonNames(path.join(dir, 'professors-detail'))).toEqual(subjects);
    expect(existsSync(path.join(dir, 'grades.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'professors-detail.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'summaries.json'))).toBe(true);
  });

  it('writes compact JSON (one line plus a trailing newline)', () => {
    for (const file of ['school.json', 'meta.json', 'subjects.json', path.join('rankings', `${subjects[0]}.json`)]) {
      const text = readFileSync(path.join(dir, file), 'utf8');
      expect(text.endsWith('\n')).toBe(true);
      expect(text.trimEnd().includes('\n'), `${file} is indented`).toBe(false);
    }
  });

  it(`keeps every rankings/<SUBJECT>.json under ${MAX_RANKINGS_FILE_BYTES / 1024} KB`, () => {
    for (const code of subjects) {
      const size = statSync(path.join(dir, 'rankings', `${code}.json`)).size;
      expect(size, `rankings/${code}.json is ${size} bytes`).toBeLessThanOrEqual(MAX_RANKINGS_FILE_BYTES);
    }
  });

  it(`keeps every professors-detail/<SUBJECT>.json under ${MAX_DETAIL_FILE_BYTES / 1024 / 1024} MB`, () => {
    for (const code of subjects) {
      const size = statSync(path.join(dir, 'professors-detail', `${code}.json`)).size;
      expect(size, `professors-detail/${code}.json is ${size} bytes`).toBeLessThanOrEqual(MAX_DETAIL_FILE_BYTES);
    }
  });

  it(`stays under ${MAX_SCHOOL_BYTES / 1024 / 1024} MB in total`, () => {
    expect(dirBytes(dir)).toBeLessThanOrEqual(MAX_SCHOOL_BYTES);
  });

  it('meta.json and school.json agree on the school and the subject list', () => {
    const meta = JSON.parse(readFileSync(path.join(dir, 'meta.json'), 'utf8')) as { subjects?: string[]; mode: string };
    const schoolRecord = JSON.parse(readFileSync(path.join(dir, 'school.json'), 'utf8')) as { id: string; mode: string; reviewsAvailable: boolean };
    expect(schoolRecord.id).toBe(school);
    expect(schoolRecord.mode).toBe(meta.mode);
    expect([...(meta.subjects ?? [])].sort()).toEqual(subjects);
    expect(typeof schoolRecord.reviewsAvailable).toBe('boolean');
  });
});
