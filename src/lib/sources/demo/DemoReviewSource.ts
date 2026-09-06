// ReviewSource over data/raw/demo/{school}/{professors.json, reviews.json} written by seed-demo.ts.
// Every professor is fictional (isFictional forced true) — the registry refuses to pair this adapter
// with real grade/schedule data.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { SchoolId } from '@/lib/domain/types';
import type { RawProfessor, RawReview, ReviewSource, SourceInfo } from '@/lib/sources/types';
import { type DepartmentMap, loadDepartments, subjectForDepartment } from '@/lib/sources/uiuc/departments';
import { demoRawDir, demoSourceLabel } from './DemoGradeSource';

const RawProfessorSchema = z.object({
  sourceId: z.string().min(1),
  firstName: z.string(),
  lastName: z.string().min(1),
  department: z.string().nullable().default(null),
  isFictional: z.boolean().optional(),
  /** Optional hint the seed may write; used for subject filtering when present. */
  subjects: z.array(z.string()).optional(),
});

const RawReviewSchema = z.object({
  sourceId: z.string().min(1),
  professorSourceId: z.string().min(1),
  courseLabel: z.string().nullable().default(null),
  date: z.string(),
  quality: z.number(),
  difficulty: z.number().nullable().default(null),
  wouldTakeAgain: z.boolean().nullable().default(null),
  gradeReceived: z.string().nullable().default(null),
  text: z.string(),
  sourceTags: z.array(z.string()).default([]),
  thumbsUp: z.number().int().min(0).default(0),
  thumbsDown: z.number().int().min(0).default(0),
});

type SeedProfessor = z.infer<typeof RawProfessorSchema>;

export interface DemoReviewSourceOptions {
  seed: number;
  dir?: string;
  departments?: DepartmentMap;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

export class DemoReviewSource implements ReviewSource {
  readonly info: SourceInfo;
  private readonly dir?: string;
  private readonly departments: DepartmentMap | null;
  private readonly log: NonNullable<DemoReviewSourceOptions['log']>;
  private professors = new Map<SchoolId, Promise<SeedProfessor[]>>();
  private reviews = new Map<SchoolId, Promise<Map<string, RawReview[]>>>();
  private lastSchool: SchoolId = 'uiuc';

  constructor(opts: DemoReviewSourceOptions) {
    this.info = { id: 'demo-reviews', label: demoSourceLabel(opts.seed), url: null, license: 'MIT' };
    this.dir = opts.dir;
    this.departments = opts.departments ?? null;
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  filePath(schoolId: SchoolId, name: 'professors.json' | 'reviews.json'): string {
    return path.join(demoRawDir(schoolId, this.dir), name);
  }

  private async readJson(schoolId: SchoolId, name: 'professors.json' | 'reviews.json'): Promise<unknown> {
    const file = this.filePath(schoolId, name);
    try {
      return JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Demo file not found at ${file}. Run \`npm run data:seed\` first.`);
      }
      throw err;
    }
  }

  private loadProfessors(schoolId: SchoolId): Promise<SeedProfessor[]> {
    let p = this.professors.get(schoolId);
    if (!p) {
      p = this.readJson(schoolId, 'professors.json').then((json) => z.array(RawProfessorSchema).parse(json));
      this.professors.set(schoolId, p);
    }
    return p;
  }

  private loadReviews(schoolId: SchoolId): Promise<Map<string, RawReview[]>> {
    let p = this.reviews.get(schoolId);
    if (!p) {
      p = this.readJson(schoolId, 'reviews.json').then((json) => {
        const byProfessor = new Map<string, RawReview[]>();
        for (const r of z.array(RawReviewSchema).parse(json)) {
          const list = byProfessor.get(r.professorSourceId) ?? [];
          list.push(r);
          byProfessor.set(r.professorSourceId, list);
        }
        return byProfessor;
      });
      this.reviews.set(schoolId, p);
    }
    return p;
  }

  /**
   * Professors whose `subjects` hint or department maps to one of `subjects`. Professors with no
   * department and no hint are always included. Every result is marked fictional.
   */
  async fetchProfessors(opts: { schoolId: SchoolId; subjects: string[] }): Promise<RawProfessor[]> {
    this.lastSchool = opts.schoolId;
    const all = await this.loadProfessors(opts.schoolId);
    const wanted = new Set(opts.subjects.map((s) => s.toUpperCase()));
    let map: DepartmentMap | null = this.departments;
    if (!map) {
      try {
        map = loadDepartments(opts.schoolId);
      } catch {
        map = null;
      }
    }
    const keep = all.filter((p) => {
      if (wanted.size === 0) return true;
      if (p.subjects && p.subjects.length > 0) return p.subjects.some((s) => wanted.has(s.toUpperCase()));
      if (!p.department || !map) return true;
      const subject = subjectForDepartment(map, p.department);
      return subject === null ? true : wanted.has(subject);
    });
    this.log.info(`[demo-reviews] ${keep.length}/${all.length} fictional professors for ${[...wanted].join(',') || 'all subjects'}`);
    return keep.map((p) => ({
      sourceId: p.sourceId,
      firstName: p.firstName,
      lastName: p.lastName,
      department: p.department,
      isFictional: true,
    }));
  }

  async fetchReviews(professorSourceId: string): Promise<RawReview[]> {
    const byProfessor = await this.loadReviews(this.lastSchool);
    return byProfessor.get(professorSourceId) ?? [];
  }
}
