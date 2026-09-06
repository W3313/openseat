// Loads the impersonal config inputs of the seed (SPEC 6.4/6.5): course priors, real-instructor keys,
// blocked surnames, departments. Node-only (fs); the generator itself is pure and takes these as input.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { lettersOnlyKey } from '@/lib/utils/hash';
import type { CoursePrior, SeedOptions } from './generator-types';
import { COURSES_PER_SUBJECT, cmp } from './generator-types';

export const CONFIG_DIR = path.join('data', 'config', 'uiuc');

/** Top N courses per subject by graded students (ties → courseId asc), sorted by subject then number. */
export function selectCourses(
  priors: readonly CoursePrior[],
  subjects: readonly string[],
  perSubject = COURSES_PER_SUBJECT,
): CoursePrior[] {
  const out: CoursePrior[] = [];
  for (const subject of [...subjects].sort()) {
    const inSubject = priors
      .filter((p) => p.subject === subject)
      .sort((x, y) => y.graded - x.graded || cmp(x.courseId, y.courseId))
      .slice(0, perSubject)
      .sort((x, y) => cmp(x.number, y.number) || cmp(x.courseId, y.courseId));
    out.push(...inSubject);
  }
  return out;
}

async function readJson<T>(root: string, file: string): Promise<T> {
  const text = await readFile(path.join(root, CONFIG_DIR, file), 'utf8');
  return JSON.parse(text) as T;
}

export interface LoadedConfig {
  priors: CoursePrior[];
  realInstructorKeys: Set<string>;
  blockedSurnames: Set<string>;
  departments: Record<string, string[]>;
}

/** Read the four committed config files under data/config/uiuc relative to `root` (default cwd). */
export async function loadSeedConfig(root: string = process.cwd()): Promise<LoadedConfig> {
  const [priors, keys, blocked, departments] = await Promise.all([
    readJson<CoursePrior[]>(root, 'course-priors.json'),
    readJson<string[]>(root, 'real-instructor-keys.json'),
    readJson<string[]>(root, 'blocked-surnames.json'),
    readJson<Record<string, string[]>>(root, 'departments.json'),
  ]);
  return {
    priors,
    realInstructorKeys: new Set(keys),
    blockedSurnames: new Set(blocked.map((s) => lettersOnlyKey(s))),
    departments,
  };
}

/** Convenience: assemble SeedOptions from the loaded config plus runtime knobs. */
export function seedOptionsFrom(
  config: LoadedConfig,
  runtime: Pick<SeedOptions, 'seed' | 'currentTerm' | 'subjects'>,
): SeedOptions {
  return {
    seed: runtime.seed,
    currentTerm: runtime.currentTerm,
    subjects: [...runtime.subjects].sort(),
    priors: config.priors,
    realInstructorKeys: config.realInstructorKeys,
    blockedSurnames: config.blockedSurnames,
    departments: config.departments,
  };
}
