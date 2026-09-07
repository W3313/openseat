// Identity rules (SPEC 5.1) in one place so ingest, rankings and the UI never disagree on an id shape.
import type { Course, Professor, SchoolId, TermCode } from '@/lib/domain/types';

/** `${schoolId}:${SUBJECT}:${number}` — number exactly as printed in the CSV (suffix letters kept). */
export function makeCourseId(schoolId: SchoolId, subject: string, number: string): string {
  return `${schoolId}:${subject.trim().toUpperCase()}:${number.trim().toUpperCase()}`;
}

export interface CourseIdParts {
  schoolId: string;
  subject: string;
  number: string;
}

export function parseCourseId(courseId: string): CourseIdParts | null {
  const parts = courseId.split(':');
  if (parts.length !== 3 || parts.some((p) => p === '')) return null;
  return { schoolId: parts[0], subject: parts[1], number: parts[2] };
}

/** "uiuc:CS:225" → "CS"; null for malformed ids. */
export function courseIdSubject(courseId: string): string | null {
  return parseCourseId(courseId)?.subject ?? null;
}

/** "uiuc:CS:225" → "CS 225". */
export function courseLabelFromId(courseId: string): string {
  const p = parseCourseId(courseId);
  return p ? `${p.subject} ${p.number}` : courseId;
}

export function courseLabel(subject: string, number: string): string {
  return `${subject.toUpperCase()} ${number}`;
}

/** Math.min(500, floor(number / 100) × 100), floored at 100 so odd numbers like "099" stay in the union. */
export function courseLevel(number: string): Course['level'] {
  // Leading digits only: UIUC uses 3-digit numbers (CS 225 → 200), UH 4-digit (COSC 2305 → 200; a letter in
  // the middle such as 4V95 → 400), Purdue 5-digit (CS 18000 → 100); the first digit carries the level whenever
  // there are 4 or more digits, and 3-digit numbers keep the hundreds. Letters (W120A, CS130H, 4V95) are dropped.
  const digits = number.replace(/\D/g, '');
  if (digits.length === 0) return 100;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return 100;
  const raw = digits.length >= 4 ? Math.floor(n / 10 ** (digits.length - 1)) * 100 : Math.floor(n / 100) * 100;
  const level = Math.min(500, Math.max(100, raw));
  return level as Course['level'];
}

/** `${schoolId}:p:${slug}` (reviewed) | `${schoolId}:g:${slug}` (grades-only). */
export function makeProfessorId(schoolId: SchoolId, kind: Professor['kind'], slug: string): string {
  return `${schoolId}:${kind === 'reviewed' ? 'p' : 'g'}:${slug}`;
}

export interface ProfessorIdParts {
  schoolId: string;
  kind: Professor['kind'];
  slug: string;
}

export function parseProfessorId(professorId: string): ProfessorIdParts | null {
  const parts = professorId.split(':');
  if (parts.length !== 3 || parts.some((p) => p === '')) return null;
  if (parts[1] !== 'p' && parts[1] !== 'g') return null;
  return { schoolId: parts[0], kind: parts[1] === 'p' ? 'reviewed' : 'grades-only', slug: parts[2] };
}

/** `${schoolId}:r:${sourceId}` */
export function makeReviewId(schoolId: SchoolId, sourceId: string): string {
  return `${schoolId}:r:${sourceId}`;
}

/** `${schoolId}:s:${term}:${crn}` */
export function makeSectionId(schoolId: SchoolId, term: TermCode, crn: string): string {
  return `${schoolId}:s:${term}:${crn}`;
}
