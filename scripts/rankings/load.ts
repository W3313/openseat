// Reads the ingest output of data/processed/<dir>/ into memory for build-rankings.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Course, GradeRow, MatchReport, Meta, Professor, ProfessorSummary, Review, School, Section, Subject,
} from '@/lib/domain/types';

export interface ProcessedData {
  dir: string;
  school: School;
  subjects: Subject[];
  courses: Course[];
  professors: Professor[];
  grades: GradeRow[];
  sections: Section[];
  reviews: Review[];
  matchReport: MatchReport;
  meta: Meta;
  /** professorId → summary; {} when summaries.json does not exist yet. */
  summaries: Record<string, ProfessorSummary>;
}

async function readJson<T>(dir: string, file: string): Promise<T> {
  const raw = await readFile(path.join(dir, file), 'utf8');
  return JSON.parse(raw) as T;
}

async function readOptional<T>(dir: string, file: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(dir, file);
  } catch {
    return fallback;
  }
}

export class ProcessedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessedDataError';
  }
}

/** Loads every ingest file; throws ProcessedDataError naming the first missing/unreadable required file. */
export async function loadProcessed(dir: string): Promise<ProcessedData> {
  const required = ['school.json', 'subjects.json', 'courses.json', 'professors.json', 'grades.json', 'sections.json', 'reviews.json', 'match-report.json', 'meta.json'];
  for (const file of required) {
    try {
      await readFile(path.join(dir, file), 'utf8');
    } catch {
      throw new ProcessedDataError(`missing ${path.join(dir, file)} — run data:ingest first`);
    }
  }
  return {
    dir,
    school: await readJson<School>(dir, 'school.json'),
    subjects: await readJson<Subject[]>(dir, 'subjects.json'),
    courses: await readJson<Course[]>(dir, 'courses.json'),
    professors: await readJson<Professor[]>(dir, 'professors.json'),
    grades: await readJson<GradeRow[]>(dir, 'grades.json'),
    sections: await readJson<Section[]>(dir, 'sections.json'),
    reviews: await readJson<Review[]>(dir, 'reviews.json'),
    matchReport: await readJson<MatchReport>(dir, 'match-report.json'),
    meta: await readJson<Meta>(dir, 'meta.json'),
    summaries: await readOptional<Record<string, ProfessorSummary>>(dir, 'summaries.json', {}),
  };
}

/** Index helpers shared by payload and detail builders. */
export interface DataIndex {
  reviewsByProfessor: Map<string, Review[]>;
  sectionsByProfessor: Map<string, Section[]>;
  coursesById: Map<string, Course>;
  professorsById: Map<string, Professor>;
}

export function indexData(data: ProcessedData): DataIndex {
  const reviewsByProfessor = new Map<string, Review[]>();
  for (const r of data.reviews) {
    const list = reviewsByProfessor.get(r.professorId);
    if (list) list.push(r);
    else reviewsByProfessor.set(r.professorId, [r]);
  }
  for (const list of reviewsByProfessor.values()) list.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const sectionsByProfessor = new Map<string, Section[]>();
  for (const s of data.sections) {
    for (const pid of s.professorIds) {
      const list = sectionsByProfessor.get(pid);
      if (list) list.push(s);
      else sectionsByProfessor.set(pid, [s]);
    }
  }
  return {
    reviewsByProfessor,
    sectionsByProfessor,
    coursesById: new Map(data.courses.map((c) => [c.id, c])),
    professorsById: new Map(data.professors.map((p) => [p.id, p])),
  };
}
