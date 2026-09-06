// RankingsPayload per subject (SPEC 6.6, scope subject).
import type { CourseRef, RankedProfessor, RankingsPayload, RankingsScope, Review, Section, Subject } from '@/lib/domain/types';
import { courseIdSubject } from '@/lib/utils/ids';
import { eligibleRows, subjectGpaMean, subjectWRate, type AggregateContext } from '@/lib/scoring/aggregate';
import { priorMean } from '@/lib/scoring/rating';
import { sectionInScope, sortRanked } from '@/lib/scoring/rank';
import type { DataIndex, ProcessedData } from './load';
import { buildRankedProfessor, sparklineRange } from './scores';

/** Professors with ≥ 1 grade row, section or review in the subject (plus anyone ingest tagged with it). */
export function professorsInSubject(data: ProcessedData, index: DataIndex, subject: string): string[] {
  const ids = new Set<string>();
  for (const p of data.professors) if (p.subjects.includes(subject)) ids.add(p.id);
  for (const row of data.grades) if (row.professorId && courseIdSubject(row.courseId) === subject) ids.add(row.professorId);
  const scope: RankingsScope = { kind: 'subject' };
  for (const s of data.sections) if (sectionInScope(s, scope, subject)) for (const pid of s.professorIds) ids.add(pid);
  for (const r of data.reviews) if (r.courseId && courseIdSubject(r.courseId) === subject) ids.add(r.professorId);
  return [...ids].filter((id) => index.professorsById.has(id)).sort();
}

function courseRefs(data: ProcessedData, subject: string, ranked: readonly RankedProfessor[]): CourseRef[] {
  const counts = new Map<string, Set<string>>();
  const bump = (courseId: string, pid: string) => {
    const set = counts.get(courseId) ?? new Set<string>();
    set.add(pid);
    counts.set(courseId, set);
  };
  for (const rp of ranked) {
    for (const c of rp.courses) if (c.subject === subject) bump(c.courseId, rp.professor.id);
    for (const s of rp.openSections) for (const id of [s.courseId, ...s.crossListedCourseIds]) if (courseIdSubject(id) === subject) bump(id, rp.professor.id);
  }
  // Sections of any status count too (a professor can teach a closed section of a course they have no rows in).
  for (const s of data.sections) {
    for (const id of [s.courseId, ...s.crossListedCourseIds]) {
      if (courseIdSubject(id) !== subject) continue;
      for (const pid of s.professorIds) if (ranked.some((rp) => rp.professor.id === pid)) bump(id, pid);
    }
  }
  return data.courses
    .filter((c) => c.subject === subject && (counts.get(c.id)?.size ?? 0) > 0)
    .map((c) => ({ courseId: c.id, number: c.number, title: c.title, professorCount: counts.get(c.id)!.size }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

export interface BuildPayloadOptions {
  generatedAt: string;
}

/** Full, unfiltered payload for one subject; `professors` sorted by the default rating order with rank null. */
export function buildSubjectPayload(data: ProcessedData, index: DataIndex, subjectCode: string, opts: BuildPayloadOptions): RankingsPayload {
  const scope: RankingsScope = { kind: 'subject' };
  const ctx: AggregateContext = { allRows: data.grades, courses: data.courses, scope, subject: subjectCode };
  const professorIds = professorsInSubject(data, index, subjectCode);

  const reviewsInScope: Review[] = professorIds.flatMap((pid) => index.reviewsByProfessor.get(pid) ?? []);
  const prior = priorMean(reviewsInScope);
  const eligible = eligibleRows(data.grades);
  const wRate = subjectWRate(eligible, subjectCode);
  const gpaMean = subjectGpaMean(eligible, subjectCode);

  const professors = professorIds.map((pid) => {
    const sections: Section[] = (index.sectionsByProfessor.get(pid) ?? []).filter((s) => sectionInScope(s, scope, subjectCode));
    return buildRankedProfessor({ data, index, professorId: pid, ctx, sections, prior, subjectWRate: wRate });
  });
  const ordered = sortRanked(professors, 'rating');

  const subject: Subject = data.subjects.find((s) => s.code === subjectCode) ?? {
    schoolId: data.school.id,
    code: subjectCode,
    name: subjectCode,
    courseCount: data.courses.filter((c) => c.subject === subjectCode).length,
    professorCount: professorIds.length,
    openSectionCount: data.sections.filter((s) => s.isOpen && sectionInScope(s, scope, subjectCode)).length,
  };

  return {
    school: data.school,
    subject,
    term: data.meta.scheduleTerm,
    scope,
    mode: data.meta.mode,
    generatedAt: opts.generatedAt,
    seatsFetchedAt: data.meta.seatsFetchedAt,
    gradesThroughTerm: data.meta.gradesThroughTerm,
    termFallback: data.meta.termFallback,
    subjectGpaMean: gpaMean,
    subjectWRate: wRate,
    priorMean: prior,
    sparklineRange: sparklineRange(ordered.flatMap((p) => p.gpaByYear)),
    courses: courseRefs(data, subjectCode, ordered),
    professors: ordered,
  };
}
