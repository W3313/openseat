// Repository over data/processed/<school>/*.json (SPEC 5, 6.6, 6.7). Reads with fs relative to
// process.cwd() (Vercel traces data/processed/** via next.config.ts), parses once, and keeps a
// module-level cache keyed by absolute path. Unknown school / subject / slug / professor → null.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Course, DataMode, MatchReport, Meta, Professor, ProfessorDetail, ProfessorSummary, RankingsPayload, School,
  SchoolId, Section, Subject,
} from '@/lib/domain/types';
import { SCHOOL_IDS, processedDirName, toSchoolId } from '@/lib/config/schools';
import { assertServerOnly } from '@/lib/config/serverOnly';
import { courseIdSubject } from '@/lib/utils/ids';
import type { Repository } from './Repository';

assertServerOnly('src/lib/repo/JsonRepository.ts');

export interface JsonRepositoryOptions {
  /** Root holding one directory per school. Default: `${process.cwd()}/data/processed`. */
  dataDir?: string;
  /** demo → `<dataDir>/<school>`; live → `<dataDir>/<school>-live` (gitignored). Default demo. */
  mode?: DataMode;
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

// ── repository ───────────────────────────────────────────────────────────────────────────────────────
export class JsonRepository implements Repository {
  readonly dataDir: string;
  readonly mode: DataMode;

  constructor(options: JsonRepositoryOptions = {}) {
    this.dataDir = options.dataDir ?? path.join(process.cwd(), 'data', 'processed');
    this.mode = options.mode ?? 'demo';
  }

  /** Absolute path of a school's processed directory (`data/processed/uiuc` or `…/uiuc-live`). */
  schoolDir(schoolId: SchoolId): string {
    return path.join(this.dataDir, processedDirName(schoolId, this.mode));
  }

  private file(schoolId: SchoolId, ...segments: string[]): string {
    return path.join(this.schoolDir(schoolId), ...segments);
  }

  private read<T>(schoolId: SchoolId, ...segments: string[]): Promise<T | null> {
    return readJsonFile<T>(this.file(schoolId, ...segments));
  }

  async getSchools(): Promise<School[]> {
    const schools = await Promise.all(SCHOOL_IDS.map((id) => this.read<School>(id, 'school.json')));
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

  async getRankingsPayload(schoolId: SchoolId, subject: string): Promise<RankingsPayload | null> {
    const code = subject.trim().toUpperCase();
    if (!SUBJECT_RE.test(code)) return null;
    return this.read<RankingsPayload>(schoolId, 'rankings', `${code}.json`);
  }

  async getProfessorBySlug(schoolId: SchoolId, slug: string): Promise<ProfessorDetail | null> {
    const key = slug.trim().toLowerCase();
    if (!SLUG_RE.test(key)) return null;
    const map = await this.read<Record<string, ProfessorDetail>>(schoolId, 'professors-detail.json');
    return map?.[key] ?? null;
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
    const schoolId = toSchoolId(professorId.split(':')[0]);
    if (!schoolId) return null;
    const map = await this.read<Record<string, ProfessorSummary>>(schoolId, 'summaries.json');
    return map?.[professorId] ?? null;
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
