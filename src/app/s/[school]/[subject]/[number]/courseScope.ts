// Pure course-scoping of a subject rankings payload (SPEC 3.3 / F20): keep the professors with grade
// rows or sections in one course and swap their headline numbers for the course-scoped values that
// already sit in `RankedProfessor.courses[i]`. No I/O, so it is unit-testable and reusable by the OG image.
import type { Course, CourseBreakdown, GradeBuckets, RankedProfessor, RankingsPayload, ProfessorScores } from "@/lib/domain/types";
import { MIN_BASELINE_N, MIN_GRADED_N } from "@/lib/domain/constants";
import { makeCourseId } from "@/lib/utils/ids";
import { sectionInCourse } from "@/lib/scoring/rank";
import { addBuckets, EMPTY_BUCKETS } from "@/lib/scoring/gpa";
import { computeBadges } from "@/lib/scoring/badges";

/** Headline breakdown entries for one course (usually one; several when sched types were split). */
export function courseEntries(p: Pick<RankedProfessor, "courses">, courseId: string): CourseBreakdown[] {
  return p.courses.filter((c) => c.courseId === courseId && c.isHeadline);
}

/** Enrollment-weighted merge of several breakdown entries into one (gpa/rates re-derived from sums). */
export function mergeEntries(entries: readonly CourseBreakdown[]): CourseBreakdown | null {
  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0];
  const buckets: GradeBuckets = addBuckets(...entries.map((e) => e.buckets));
  const graded = entries.reduce((s, e) => s + e.graded, 0);
  const withdrawn = entries.reduce((s, e) => s + e.withdrawn, 0);
  const wgpa = entries.reduce((s, e) => s + (e.gpa ?? 0) * e.graded, 0);
  const gpa = graded > 0 ? wgpa / graded : null;
  const withBaseline = entries.filter((e) => e.baselineGpa != null);
  const baselineN = withBaseline.reduce((m, e) => Math.max(m, e.baselineN), 0);
  const baselineGpa = withBaseline.length ? withBaseline.reduce((s, e) => s + (e.baselineGpa ?? 0), 0) / withBaseline.length : null;
  const delta = gpa != null && baselineGpa != null && baselineN >= MIN_BASELINE_N ? gpa - baselineGpa : null;
  const students = graded + withdrawn;
  const aCount = buckets.aPlus + buckets.a + buckets.aMinus;
  const dfw = buckets.dPlus + buckets.d + buckets.dMinus + buckets.f + buckets.w;
  return {
    ...entries[0],
    gradeRows: entries.reduce((s, e) => s + e.gradeRows, 0),
    graded,
    withdrawn,
    gpa,
    aRate: graded > 0 ? aCount / graded : null,
    wRate: students > 0 ? withdrawn / students : null,
    dfwRate: students > 0 ? dfw / students : null,
    baselineGpa,
    baselineN,
    delta,
    buckets,
  };
}

/** Course-scoped scores: grade numbers from the breakdown, review numbers untouched. */
export function scopeScores(scores: ProfessorScores, entry: CourseBreakdown | null): ProfessorScores {
  if (!entry) {
    return {
      ...scores,
      gradeRows: 0,
      studentsGraded: 0,
      withdrawn: 0,
      gpaMean: null,
      aRate: null,
      wRate: null,
      dfwRate: null,
      gpaDelta: null,
      deltaComparableN: 0,
      soleInstructor: false,
    };
  }
  const suppressed = entry.graded < MIN_GRADED_N;
  return {
    ...scores,
    gradeRows: entry.gradeRows,
    studentsGraded: entry.graded,
    withdrawn: entry.withdrawn,
    gpaMean: suppressed ? null : entry.gpa,
    aRate: suppressed ? null : entry.aRate,
    wRate: suppressed ? null : entry.wRate,
    dfwRate: suppressed ? null : entry.dfwRate,
    gpaDelta: suppressed ? null : entry.delta,
    deltaComparableN: entry.delta != null ? entry.graded : 0, // Σ n_c(P): the professor's own graded students (SPEC 8.3)
    soleInstructor: !suppressed && entry.gpa != null && entry.delta == null && entry.baselineN < MIN_BASELINE_N,
  };
}

/** One professor restricted to a course; null when they have neither rows nor sections in it. */
export function scopeProfessor(p: RankedProfessor, courseId: string, subjectWRate: number | null = null): RankedProfessor | null {
  const headline = mergeEntries(courseEntries(p, courseId));
  const allEntries = p.courses.filter((c) => c.courseId === courseId);
  const openSections = p.openSections.filter((s) => sectionInCourse(s, courseId));
  if (!headline && allEntries.length === 0 && openSections.length === 0) return null;
  const scores = scopeScores(p.scores, headline);
  return {
    ...p,
    rank: null,
    scores,
    // Badges are thresholds over the aggregates shown (SPEC 8.11), so they follow the course scope too.
    badges: computeBadges({ scores, openSectionCount: openSections.length, subjectWRate }),
    distribution: headline ? headline.buckets : { ...EMPTY_BUCKETS },
    courses: allEntries,
    openSections,
    // Sparkline data is subject-wide; a single-course trend is not precomputed, so hide it.
    gpaByYear: [],
  };
}

/** Course-scoped payload for `/s/[school]/[subject]/[number]`. */
export function scopePayloadToCourse(payload: RankingsPayload, number: string): RankingsPayload {
  const courseId = makeCourseId(payload.school.id, payload.subject.code, number);
  const professors = payload.professors.map((p) => scopeProfessor(p, courseId, payload.subjectWRate)).filter((p): p is RankedProfessor => p !== null);
  const ref = payload.courses.find((c) => c.courseId === courseId);
  return {
    ...payload,
    scope: { kind: "course", courseId },
    courses: ref ? [ref] : [],
    professors,
  };
}

/** "avg GPA 3.21 across 4,120 students, 7 instructors" */
export function courseSummaryLine(course: Pick<Course, "gpaMean" | "graded" | "instructorCount">): string {
  const gpa = course.gpaMean == null ? "avg GPA n/a" : `avg GPA ${course.gpaMean.toFixed(2)}`;
  return `${gpa} across ${course.graded.toLocaleString("en-US")} students, ${course.instructorCount} ${course.instructorCount === 1 ? "instructor" : "instructors"}`;
}
