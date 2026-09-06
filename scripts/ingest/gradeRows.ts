// RawGradeRow → GradeRow (SPEC 5 GradeRow, 8.1 row-level formulas). Matching fields are filled later.
import type { GradeRow, SchoolId, TermCode } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { gradeRowId } from '@/lib/utils/hash';
import { makeCourseId } from '@/lib/utils/ids';
import { isTermCode, inGradeWindow, maxTerm, termFromCsv, termYear } from '@/lib/utils/term';
import { isHeadlineSchedType, isSuppressed, normalizeSchedType, rowStats } from '@/lib/scoring/gpa';
import { parseName } from '@/lib/matching';

export interface BuildGradeRowsOptions {
  schoolId: SchoolId;
  currentTerm: TermCode;
  yearsBack: number;
}

export interface BuildGradeRowsResult {
  rows: GradeRow[];
  /** Rows dropped because their term was outside the grade window (the adapter should already have filtered). */
  outOfWindow: number;
  /** Rows dropped because their YearTerm could not be parsed. */
  badTerm: number;
  /** Rows with an empty instructor cell (kept for course baselines, never attached to a professor). */
  emptyInstructor: number;
  /** Rows whose instructor is on the blocklist ("Staff", "TBA", …). */
  blocked: number;
}

function resolveTerm(raw: RawGradeRow): TermCode | null {
  const yt = raw.yearTerm.trim().toLowerCase();
  if (isTermCode(yt)) return yt;
  try {
    return termFromCsv(raw.year, raw.term);
  } catch {
    return null;
  }
}

/** Normalize every raw row; drops out-of-window and unparsable-term rows and reports the counts. */
export function buildGradeRows(raw: readonly RawGradeRow[], opts: BuildGradeRowsOptions): BuildGradeRowsResult {
  const rows: GradeRow[] = [];
  let outOfWindow = 0;
  let badTerm = 0;
  let emptyInstructor = 0;
  let blocked = 0;
  const seen = new Set<string>();

  for (const r of raw) {
    const term = resolveTerm(r);
    if (!term) {
      badTerm++;
      continue;
    }
    if (!inGradeWindow(term, opts.currentTerm, opts.yearsBack)) {
      outOfWindow++;
      continue;
    }
    const subject = r.subject.trim().toUpperCase();
    const number = r.number.trim().toUpperCase();
    if (subject === '' || number === '') continue;
    const courseId = makeCourseId(opts.schoolId, subject, number);
    const schedType = normalizeSchedType(r.schedType ?? '');
    const instructorRaw = (r.instructorRaw ?? '').trim();
    const nameKey = instructorRaw === '' ? null : parseName(instructorRaw);
    if (instructorRaw === '') emptyInstructor++;
    else if (nameKey === null) blocked++;

    const stats = rowStats(r.buckets);
    let id = gradeRowId(opts.schoolId, courseId, term, schedType, instructorRaw);
    // The id key is (course, term, schedType, instructor); a duplicate aggregate in the source gets a suffix
    // so provenance is never silently lost.
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    seen.add(id);

    rows.push({
      id,
      schoolId: opts.schoolId,
      courseId,
      term,
      year: termYear(term),
      schedType,
      isHeadline: isHeadlineSchedType(schedType),
      instructorRaw,
      nameKey,
      professorId: null,
      matchMethod: instructorRaw === '' ? 'unmatched' : nameKey === null ? 'blocked' : 'unmatched',
      matchScore: 0,
      buckets: { ...r.buckets },
      graded: stats.graded,
      withdrawn: stats.withdrawn,
      students: stats.students,
      gpa: stats.gpa,
      suppressed: isSuppressed(stats.graded),
    });
  }

  rows.sort((a, b) => (a.courseId + a.term + a.schedType + a.instructorRaw + a.id).localeCompare(b.courseId + b.term + b.schedType + b.instructorRaw + b.id));
  return { rows, outOfWindow, badTerm, emptyInstructor, blocked };
}

/** gradesThroughTerm = max term over all rows; null when there are none. */
export function gradesThroughTerm(rows: readonly GradeRow[]): TermCode | null {
  return maxTerm(rows.map((r) => r.term));
}
