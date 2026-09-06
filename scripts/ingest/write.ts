// Output stage (SPEC 6.3 steps 5-6): Subject records, processed files, datasetHash and meta.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Course, Meta, MetaCounts, Professor, ProfessorSummary, Section, Subject, SchoolId } from '@/lib/domain/types';
import { courseIdSubject } from '@/lib/utils/ids';
import { stableStringify } from '@/lib/utils/stableStringify';
import { datasetHash } from '@/lib/utils/hash';
import { sectionCourseIds } from './sections';

/** Order matters: datasetHash is sha256 over the concatenated stable JSON of exactly these eight files. */
export const HASHED_FILES = [
  'school.json', 'subjects.json', 'courses.json', 'professors.json', 'grades.json', 'sections.json', 'reviews.json', 'match-report.json',
] as const;
export type HashedFile = (typeof HASHED_FILES)[number];

/** Subject records for every subject that has a course, professor or section (SPEC 5 Subject). */
export function buildSubjects(
  schoolId: SchoolId,
  subjectNames: Readonly<Record<string, string>>,
  courses: readonly Course[],
  professors: readonly Professor[],
  sections: readonly Section[],
  requested: readonly string[],
): Subject[] {
  const codes = new Set<string>(requested);
  for (const c of courses) codes.add(c.subject);
  for (const p of professors) for (const s of p.subjects) codes.add(s);
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

/** Serialize with stableStringify and a trailing newline (every committed file ends with "\n"). */
export function serialize(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

export async function writeJson(dir: string, file: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
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
  /** file name → bytes written */
  sizes: Record<string, number>;
  datasetHash: string;
}

/**
 * Write the eight hashed files in order, then meta.json with the computed datasetHash filled in.
 * `meta.datasetHash` on the input is ignored/overwritten.
 */
export async function writeProcessed(dir: string, files: Record<HashedFile, unknown>, meta: Omit<Meta, 'datasetHash'>): Promise<WrittenFiles> {
  const contents: string[] = [];
  const sizes: Record<string, number> = {};
  for (const name of HASHED_FILES) {
    const content = serialize(files[name]);
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
