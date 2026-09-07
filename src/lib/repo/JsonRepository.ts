// Repository over data/processed/<school>/ (SPEC 5, 6.6, 6.7; MULTI_SCHOOL_DESIGN §3). Reads with fs
// relative to process.cwd() (Vercel traces data/processed/** via next.config.ts), parses once, and keeps a
// module-level cache keyed by absolute path. Per-subject files are loaded lazily on first use.
// Unknown school / subject / slug / professor → null.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Course, GradeRow, MatchReport, Meta, Professor, ProfessorDetail, ProfessorSummary, RankingsPayload, School,
  SchoolId, Section, Subject,
} from '@/lib/domain/types';
import { env } from '@/lib/config/env';
import { toSchoolId } from '@/lib/config/schools';
import { assertServerOnly } from '@/lib/config/serverOnly';
import { courseIdSubject } from '@/lib/utils/ids';
import type { Repository } from './Repository';

assertServerOnly('src/lib/repo/JsonRepository.ts');

export interface JsonRepositoryOptions {
  /** Root holding one directory per school. Default: `${process.cwd()}/data/processed`. */
  dataDir?: string;
  /** Schools `getSchools()` enumerates (default: the SCHOOLS env allowlist). */
  schoolIds?: readonly SchoolId[];
}

/** A processed file exists but cannot be read or parsed — a build problem, never swallowed. */
export class RepositoryFileError extends Error {
  constructor(public readonly filePath: string, message: string) {
    super(`${message} (${filePath})`);
    this.name = 'RepositoryFileError';
  }
}

/** Thrown by the non-nullable getters (meta, match report) when the school's dataset is absent. */
export class RepositoryNotFoundError extends Error {
  constructor(public readonly filePath: string) {
    super(`Processed data file not found: ${filePath}. Run the data pipeline (npm run data:all).`);
    this.name = 'RepositoryNotFoundError';
  }
}

const SUBJECT_RE = /^[A-Z]{2,5}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Longest identifier accepted before any lookup; anything longer is treated as unknown without touching the data. */
const MAX_KEY_LENGTH = 128;

/**
 * Own-property lookup on a JSON.parse'd record. User-supplied keys such as `constructor` or `__proto__`
 * pass the slug regex but would otherwise reach Object.prototype and return a function instead of null.
 */
function ownEntry<T>(map: Record<string, T> | null, key: string): T | null {
  if (!map || !Object.hasOwn(map, key)) return null;
  return map[key] ?? null;
}

// ── module-level cache ───────────────────────────────────────────────────────────────────────────────
const cache = new Map<string, Promise<unknown>>();
let fileReads = 0;

/** Drop every cached file (tests; dev tooling after regenerating data). */
export function clearRepositoryCache(): void {
  cache.clear();
}

/** Observability for tests: cached entries and the number of real disk reads performed. */
export function repositoryCacheStats(): { entries: number; fileReads: number } {
  return { entries: cache.size, fileReads };
}

function isMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Read + parse one JSON file; null when it does not exist. Successful reads are cached forever. */
async function readJsonFile<T>(absPath: string): Promise<T | null> {
  const hit = cache.get(absPath);
  if (hit) return hit as Promise<T | null>;
  const pending = (async (): Promise<T | null> => {
    let text: string;
    try {
      text = await readFile(absPath, 'utf8');
      fileReads++;
    } catch (err) {
      if (isMissing(err)) return null;
      throw new RepositoryFileError(absPath, `Failed to read processed data: ${(err as Error).message}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new RepositoryFileError(absPath, `Invalid JSON in processed data: ${(err as Error).message}`);
    }
  })();
  cache.set(absPath, pending);
  try {
    const value = await pending;
    if (value === null) cache.delete(absPath); // misses are re-checked: data may appear after a pipeline run
    return value;
  } catch (err) {
    cache.delete(absPath);
    throw err;
  }
}

/** Derived index cached under a synthetic key next to its source file (cleared with the file cache). */
function derived<T>(key: string, build: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const pending = build();
  cache.set(key, pending);
  pending.catch(() => cache.delete(key));
  return pending;
}

// ── repository ───────────────────────────────────────────────────────────────────────────────────────
export class JsonRepository implements Repository {
  readonly dataDir: string;
  readonly schoolIds: readonly SchoolId[];

  constructor(options: JsonRepositoryOptions = {}) {
    this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'processed');
    this.schoolIds = options.schoolIds ?? env.SCHOOLS;
  }

  /** Absolute path of a school's processed directory (`data/processed/<school>`). */
  schoolDir(schoolId: SchoolId): string {
    return path.join(this.dataDir, schoolId);
  }

  private file(schoolId: SchoolId, ...segments: string[]): string {
    return path.join(this.schoolDir(schoolId), ...segments);
  }

  private read<T>(schoolId: SchoolId, ...segments: string[]): Promise<T | null> {
    return readJsonFile<T>(this.file(schoolId, ...segments));
  }

  async getSchools(): Promise<School[]> {
    const schools = await Promise.all(this.schoolIds.map((id) => this.read<School>(id, 'school.json')));
    return schools.filter((s): s is School => s !== null);
  }

  async getSchool(schoolId: string): Promise<School | null> {
    const id = toSchoolId(schoolId);
    return id ? this.read<School>(id, 'school.json') : null;
  }

  async getSubjects(schoolId: SchoolId): Promise<Subject[]> {
    return (await this.read<Subject[]>(schoolId, 'subjects.json')) ?? [];
  }

  async getCourses(schoolId: SchoolId, subject?: string): Promise<Course[]> {
    const courses = (await this.read<Course[]>(schoolId, 'courses.json')) ?? [];
    if (subject === undefined) return courses;
    const code = subject.trim().toUpperCase();
    return courses.filter((c) => c.subject === code);
  }

  async getGradeRows(schoolId: SchoolId, subject: string): Promise<GradeRow[]> {
    const code = subject.trim().toUpperCase();
    if (!SUBJECT_RE.test(code)) return [];
    return (await this.read<GradeRow[]>(schoolId, 'grades', `${code}.json`)) ?? [];
  }

  async getRankingsPayload(schoolId: SchoolId, subject: string): Promise<RankingsPayload | null> {
    const code = subject.trim().toUpperCase();
    if (!SUBJECT_RE.test(code)) return null; // the only user-derived path segment; anything else is a fixed file name
    return this.read<RankingsPayload>(schoolId, 'rankings', `${code}.json`);
  }

  /** slug → Professor over professors.json, built once per school. */
  private professorsBySlug(schoolId: SchoolId): Promise<Map<string, Professor>> {
    return derived(`${this.file(schoolId, 'professors.json')}#bySlug`, async () => {
      const map = new Map<string, Professor>();
      for (const p of await this.getProfessors(schoolId)) map.set(p.slug, p);
      return map;
    });
  }

  async getProfessorBySlug(schoolId: SchoolId, slug: string): Promise<ProfessorDetail | null> {
    const key = slug.trim().toLowerCase();
    if (key.length > MAX_KEY_LENGTH || !SLUG_RE.test(key)) return null;
    const professor = (await this.professorsBySlug(schoolId)).get(key);
    if (!professor) return null;
    // The detail is school-wide, so it is identical in every subject file the professor appears in.
    for (const subject of professor.subjects) {
      if (!SUBJECT_RE.test(subject)) continue;
      const map = await this.read<Record<string, ProfessorDetail>>(schoolId, 'professors-detail', `${subject}.json`);
      const hit = ownEntry(map, key);
      if (hit) return hit;
    }
    return null;
  }

  async getProfessors(schoolId: SchoolId): Promise<Professor[]> {
    return (await this.read<Professor[]>(schoolId, 'professors.json')) ?? [];
  }

  async getSections(schoolId: SchoolId, subject: string): Promise<Section[]> {
    const code = subject.trim().toUpperCase();
    const sections = (await this.read<Section[]>(schoolId, 'sections.json')) ?? [];
    return sections.filter(
      (s) => courseIdSubject(s.courseId) === code || s.crossListedCourseIds.some((c) => courseIdSubject(c) === code),
    );
  }

  async getSummary(professorId: string): Promise<ProfessorSummary | null> {
    if (professorId.length > MAX_KEY_LENGTH) return null;
    const schoolId = toSchoolId(professorId.split(':')[0]);
    if (!schoolId) return null;
    const map = await this.read<Record<string, ProfessorSummary>>(schoolId, 'summaries.json');
    return ownEntry(map, professorId);
  }

  async getMatchReport(schoolId: SchoolId): Promise<MatchReport> {
    const report = await this.read<MatchReport>(schoolId, 'match-report.json');
    if (!report) throw new RepositoryNotFoundError(this.file(schoolId, 'match-report.json'));
    return report;
  }

  async getMeta(schoolId: SchoolId): Promise<Meta> {
    const meta = await this.read<Meta>(schoolId, 'meta.json');
    if (!meta) throw new RepositoryNotFoundError(this.file(schoolId, 'meta.json'));
    return meta;
  }
}
