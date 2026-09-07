// Course catalog (SPEC 6.3 step 1) and course-level stats (step 5). Pure functions over raw rows.
import type { Course, GradeBuckets, GradeRow, SchoolId } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { courseLevel, makeCourseId, parseCourseId } from '@/lib/utils/ids';
import { isTermCode, termOrdinal } from '@/lib/utils/term';
import { EMPTY_BUCKETS, addBuckets, rowStats } from '@/lib/scoring/gpa';
import { hasEnoughRows } from '@/lib/scoring/aggregate';

/**
 * Distinct (subject, number) → Course with the title of the most recent term (ties: last seen).
 * Stats are zeroed here and filled in by `computeCourseStats` once grade rows exist.
 */
export function buildCourseCatalog(rows: readonly RawGradeRow[], schoolId: SchoolId): Course[] {
  const byId = new Map<string, { course: Course; ordinal: number }>();
  for (const raw of rows) {
    const subject = raw.subject.trim().toUpperCase();
    const number = raw.number.trim().toUpperCase();
    if (subject === '' || number === '') continue;
    const id = makeCourseId(schoolId, subject, number);
    const ordinal = isTermCode(raw.yearTerm) ? termOrdinal(raw.yearTerm) : -1;
    const title = raw.title.trim();
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, {
        ordinal,
        course: {
          id,
          schoolId,
          subject,
          number,
          title,
          level: courseLevel(number),
          gpaMean: null,
          graded: 0,
          withdrawn: 0,
          wRate: null,
          instructorCount: 0,
          buckets: { ...EMPTY_BUCKETS },
        },
      });
    } else if (ordinal >= existing.ordinal && title !== '') {
      existing.ordinal = ordinal;
      existing.course.title = title;
    }
  }
  return [...byId.values()]
    .map((e) => e.course)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Ensure every course referenced by a section exists in the catalog (schedule-only courses get a title from the section). */
export function ensureCoursesExist(
  courses: Course[],
  schoolId: SchoolId,
  refs: readonly { courseId: string; title?: string }[],
): Course[] {
  const ids = new Set(courses.map((c) => c.id));
  const out = [...courses];
  for (const ref of refs) {
    if (ids.has(ref.courseId)) continue;
    const parts = parseCourseId(ref.courseId);
    if (!parts) continue;
    ids.add(ref.courseId);
    out.push({
      id: ref.courseId,
      schoolId,
      subject: parts.subject,
      number: parts.number,
      title: ref.title ?? `${parts.subject} ${parts.number}`,
      level: courseLevel(parts.number),
      gpaMean: null,
      graded: 0,
      withdrawn: 0,
      wRate: null,
      instructorCount: 0,
      buckets: { ...EMPTY_BUCKETS },
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Course.gpaMean/graded/withdrawn/wRate/instructorCount/buckets over ALL headline, in-window,
 * non-suppressed rows (incl. empty-instructor rows). Returns new Course objects. gpaMean/wRate are
 * published only with enough data: ≥ MIN_GRADED_N students, or ≥ MIN_SECTIONS_N sections for percent-only
 * rows (MULTI_SCHOOL_DESIGN §4.1 — the same gate professors get).
 */
export function computeCourseStats(courses: readonly Course[], rows: readonly GradeRow[]): Course[] {
  const byCourse = new Map<string, { buckets: GradeBuckets[]; rows: GradeRow[]; professors: Set<string> }>();
  for (const row of rows) {
    if (!row.isHeadline || row.suppressed) continue;
    let entry = byCourse.get(row.courseId);
    if (!entry) {
      entry = { buckets: [], rows: [], professors: new Set() };
      byCourse.set(row.courseId, entry);
    }
    entry.buckets.push(row.buckets);
    entry.rows.push(row);
    if (row.professorId) entry.professors.add(row.professorId);
  }
  return courses.map((course) => {
    const entry = byCourse.get(course.id);
    if (!entry) {
      return { ...course, gpaMean: null, graded: 0, withdrawn: 0, wRate: null, instructorCount: 0, buckets: { ...EMPTY_BUCKETS } };
    }
    const buckets = addBuckets(...entry.buckets);
    const stats = rowStats(buckets);
    const enough = hasEnoughRows(entry.rows, stats.graded);
    return {
      ...course,
      buckets,
      graded: stats.graded,
      withdrawn: stats.withdrawn,
      gpaMean: enough ? stats.gpa : null,
      wRate: enough ? stats.wRate : null,
      instructorCount: entry.professors.size,
    };
  });
}

/** "CS225" | "cs 225" | "CS-225" → "uiuc:CS:225" when that course exists in the catalog; null otherwise. */
export function courseIdFromLabel(
  label: string | null | undefined,
  schoolId: SchoolId,
  catalogIds: ReadonlySet<string>,
): string | null {
  if (!label) return null;
  const compact = label.replace(/[\s\-_:]+/g, '').toUpperCase();
  const m = /^([A-Z]{2,5})(\d{3}[A-Z]?)$/.exec(compact);
  if (!m) return null;
  const id = makeCourseId(schoolId, m[1], m[2]);
  return catalogIds.has(id) ? id : null;
}
