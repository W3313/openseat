// Output stage (SPEC 6.3 steps 5-6; MULTI_SCHOOL_DESIGN §3): Subject records, processed files (grades split
// per subject), datasetHash and meta.json. Every file is compact stable JSON with a trailing newline.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Course, GradeRow, Meta, MetaCounts, Professor, ProfessorSummary, Section, Subject, SchoolId } from '@/lib/domain/types';
import { courseIdSubject } from '@/lib/utils/ids';
import { stableStringify } from '@/lib/utils/stableStringify';
import { datasetHash } from '@/lib/utils/hash';
import { sectionCourseIds } from './sections';

/** Fixed (whole-school) files. datasetHash covers these plus every grades/<SUBJECT>.json — see hashedFileOrder(). */
export const HASHED_FILES = [
  'school.json', 'subjects.json', 'courses.json', 'professors.json', 'sections.json', 'reviews.json', 'match-report.json',
] as const;
export type HashedFile = (typeof HASHED_FILES)[number];

export const GRADES_DIR = 'grades';

/**
 * Relative paths in hash order: school, subjects, courses, professors, grades/<S>.json (S sorted), sections,
 * reviews, match-report. The order is part of the datasetHash contract.
 */
export function hashedFileOrder(subjects: readonly string[]): string[] {
  const grades = [...subjects].sort().map((s) => `${GRADES_DIR}/${s}.json`);
  return ['school.json', 'subjects.json', 'courses.json', 'professors.json', ...grades, 'sections.json', 'reviews.json', 'match-report.json'];
}

/** Persisted form of a GradeRow: `nameKey` is dropped (≈ 250 B/row, derivable via parseName(instructorRaw)). */
export function persistedGradeRow(row: GradeRow): GradeRow {
  const { nameKey: _nameKey, ...rest } = row;
  void _nameKey;
  return rest;
}

/** GradeRow[] → subject → persisted rows (row order preserved). */
export function splitGradesBySubject(rows: readonly GradeRow[], subjects: readonly string[] = []): Record<string, GradeRow[]> {
  const out: Record<string, GradeRow[]> = {};
  for (const s of subjects) out[s] = [];
  for (const row of rows) {
    const subject = courseIdSubject(row.courseId) ?? '';
    if (subject === '') continue;
    (out[subject] ??= []).push(persistedGradeRow(row));
  }
  return out;
}

export interface BuildSubjectsOptions {
  /** Emit only the requested codes (subject allowlist in force); default: requested ∪ course ∪ professor subjects. */
  restrictToRequested?: boolean;
}

/** Subject records for every subject that has a course, professor or section (SPEC 5 Subject). */
export function buildSubjects(
  schoolId: SchoolId,
  subjectNames: Readonly<Record<string, string>>,
  courses: readonly Course[],
  professors: readonly Professor[],
  sections: readonly Section[],
  requested: readonly string[],
  opts: BuildSubjectsOptions = {},
): Subject[] {
  const codes = new Set<string>(requested);
  if (!opts.restrictToRequested) {
    for (const c of courses) codes.add(c.subject);
    for (const p of professors) for (const s of p.subjects) codes.add(s);
  }
  const out: Subject[] = [];
  for (const code of [...codes].sort()) {
    const openSectionCount = sections.filter((s) => s.isOpen && sectionCourseIds(s).some((id) => courseIdSubject(id) === code)).length;
    out.push({
      schoolId,
      code,
      name: subjectNames[code] ?? code,
      courseCount: courses.filter((c) => c.subject === code).length,
      professorCount: professors.filter((p) => p.subjects.includes(code)).length,
      openSectionCount,
    });
  }
  return out;
}

/** Serialize with stableStringify (compact) and a trailing newline (every committed file ends with "\n"). */
export function serialize(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

export async function writeJson(dir: string, file: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await writeFile(path.join(dir, file), content, 'utf8');
}

/** Read an optional JSON file; undefined when missing or unparsable. */
export async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Delete `<dir>/<sub>/*.json` whose basename is not in `keep`, plus any legacy single-file sibling. */
export async function pruneSubjectFiles(dir: string, sub: string, keep: readonly string[], legacyFile?: string): Promise<string[]> {
  const removed: string[] = [];
  const target = path.join(dir, sub);
  await mkdir(target, { recursive: true });
  for (const file of await readdir(target)) {
    if (file.endsWith('.json') && !keep.includes(file.slice(0, -5))) {
      await rm(path.join(target, file));
      removed.push(`${sub}/${file}`);
    }
  }
  if (legacyFile) {
    try {
      await rm(path.join(dir, legacyFile));
      removed.push(legacyFile);
    } catch {
      /* absent */
    }
  }
  return removed;
}

/** Counts of cached summaries by source (meta.counts.summariesClaude/Extractive). */
export function summaryCounts(summaries: Readonly<Record<string, ProfessorSummary>> | undefined): Pick<MetaCounts, 'summariesClaude' | 'summariesExtractive' | 'summariesOpenAiCompatible'> {
  let claude = 0;
  let llm = 0;
  let extractive = 0;
  for (const s of Object.values(summaries ?? {})) {
    if (s.source === 'claude') claude++;
    else if (s.source === 'openai-compatible') llm++;
    else extractive++;
  }
  return { summariesClaude: claude, summariesExtractive: extractive, summariesOpenAiCompatible: llm };
}

export interface WrittenFiles {
  /** relative file name → bytes written */
  sizes: Record<string, number>;
  datasetHash: string;
}

/**
 * Write the fixed files and grades/<SUBJECT>.json in hash order, then meta.json with the computed
 * datasetHash filled in. `meta.datasetHash` on the input is ignored/overwritten. Stale grades files of
 * subjects no longer present (and a legacy grades.json) are removed so the directory mirrors subjects.json.
 */
export async function writeProcessed(
  dir: string,
  files: Record<HashedFile, unknown>,
  gradesBySubject: Readonly<Record<string, readonly GradeRow[]>>,
  meta: Omit<Meta, 'datasetHash'>,
): Promise<WrittenFiles> {
  const subjects = Object.keys(gradesBySubject).sort();
  await pruneSubjectFiles(dir, GRADES_DIR, subjects, 'grades.json');
  const contents: string[] = [];
  const sizes: Record<string, number> = {};
  for (const name of hashedFileOrder(subjects)) {
    const value = name.startsWith(`${GRADES_DIR}/`) ? gradesBySubject[name.slice(GRADES_DIR.length + 1, -5)] : files[name as HashedFile];
    const content = serialize(value);
    contents.push(content);
    sizes[name] = Buffer.byteLength(content, 'utf8');
    await writeJson(dir, name, content);
  }
  const hash = datasetHash(contents);
  const metaContent = serialize({ ...meta, datasetHash: hash } satisfies Meta);
  sizes['meta.json'] = Buffer.byteLength(metaContent, 'utf8');
  await writeJson(dir, 'meta.json', metaContent);
  return { sizes, datasetHash: hash };
}

/** Thousands separator for the summary line ("1,812 grade rows"). */
export function n(value: number): string {
  return value.toLocaleString('en-US');
}
