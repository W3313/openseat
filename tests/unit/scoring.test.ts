import { describe, expect, it } from 'vitest';
import type { Course, GradeBuckets, GradeRow, Review, TermCode } from '@/lib/domain/types';
import { GPA_POINTS, LETTER_BUCKET_KEYS } from '@/lib/domain/constants';
import { inGradeWindow, termOrdinal } from '@/lib/utils/term';
import {
  EMPTY_BUCKETS, gpaFromBuckets, isHeadlineSchedType, isPercentOnly, isSuppressed, normalizeSchedType, rowStats, rowWeight, scaleBuckets,
  sumWeightedBuckets,
} from '@/lib/scoring/gpa';
import {
  aggregateProfessorGrades, courseBreakdowns, gpaByYear, hasEnoughRows, leaveOneOutBaseline, subjectGpaMean, subjectWRate,
} from '@/lib/scoring/aggregate';
import { confidenceLabel, priorMean, ratingRaw, reviewScores, shrinkRating } from '@/lib/scoring/rating';
import { composite, round1 } from '@/lib/scoring/composite';

// ---------- fixture helpers ----------
function buckets(partial: Partial<GradeBuckets>): GradeBuckets {
  return { ...EMPTY_BUCKETS, ...partial };
}

let rowSeq = 0;
function row(opts: {
  courseId: string; professorId: string | null; b: Partial<GradeBuckets>;
  year?: number; term?: TermCode; schedType?: string; suppressed?: boolean; percentOnly?: boolean; weight?: number;
}): GradeRow {
  const bk = buckets(opts.b);
  const st = rowStats(bk);
  const schedType = opts.schedType ?? 'LEC';
  return {
    ...(opts.percentOnly ? { percentOnly: true } : {}),
    ...(opts.weight !== undefined ? { weight: opts.weight } : {}),
    id: `row-${++rowSeq}`, schoolId: 'uiuc', courseId: opts.courseId,
    term: opts.term ?? (`${opts.year ?? 2024}-fa` as TermCode), year: opts.year ?? 2024,
    schedType, isHeadline: isHeadlineSchedType(schedType),
    instructorRaw: opts.professorId ?? '', nameKey: null, professorId: opts.professorId,
    matchMethod: opts.professorId ? 'exact' : 'unmatched', matchScore: opts.professorId ? 1 : 0,
    buckets: bk, graded: st.graded, withdrawn: st.withdrawn, students: st.students, gpa: st.gpa,
    suppressed: opts.suppressed ?? isSuppressed(st.graded),
  };
}

const CS225 = 'uiuc:CS:225';
const CS498 = 'uiuc:CS:498';
const MATH241 = 'uiuc:MATH:241';
const courses: Course[] = [
  { id: CS225, schoolId: 'uiuc', subject: 'CS', number: '225', title: 'Data Structures', level: 200, gpaMean: null, graded: 0, withdrawn: 0, wRate: null, instructorCount: 0, buckets: buckets({}) },
];

const P1 = 'uiuc:p:one'; const P2 = 'uiuc:p:two'; const P3 = 'uiuc:p:three'; const P4 = 'uiuc:p:four';

const fixtureRows: GradeRow[] = [
  row({ courseId: CS225, professorId: P1, b: { a: 20 }, year: 2023 }),            // gpa 4.0, n 20
  row({ courseId: CS225, professorId: P2, b: { b: 30 } }),                        // gpa 3.0, n 30
  row({ courseId: CS225, professorId: P3, b: { c: 10 } }),                        // gpa 2.0, n 10
  row({ courseId: CS225, professorId: null, b: { a: 10 } }),                      // empty-instructor row: counts in baselines
  row({ courseId: CS225, professorId: P1, b: { a: 5 } }),                         // suppressed (graded 5) → ignored everywhere
  row({ courseId: CS225, professorId: P2, b: { f: 20 }, schedType: 'DIS' }),      // TA row → breakdown only
  row({ courseId: MATH241, professorId: P1, b: { b: 10 }, year: 2024 }),          // out of subject scope for CS
  row({ courseId: CS498, professorId: P4, b: { a: 20, w: 5 } }),                  // sole instructor
];

function review(quality: number, extra: Partial<Review> = {}): Review {
  return {
    id: `r-${Math.random()}`, professorId: P1, courseId: CS225, courseLabel: 'CS 225', date: '2025-01-01',
    quality, difficulty: null, wouldTakeAgain: null, gradeReceived: null, text: '', sourceTags: [], vibeTags: [],
    helpfulVotes: 0, sentiment: 0, ...extra,
  };
}

// ---------- 8.1 row level ----------
describe('gpa.ts row formulas', () => {
  it('uses the GPA points table for every letter bucket', () => {
    for (const key of LETTER_BUCKET_KEYS) {
      expect(gpaFromBuckets(buckets({ [key]: 10 }))).toBeCloseTo(GPA_POINTS[key], 10);
    }
    expect(GPA_POINTS.aPlus).toBe(4.0);
    expect(GPA_POINTS.aMinus).toBe(3.67);
    expect(GPA_POINTS.f).toBe(0);
    expect(gpaFromBuckets(buckets({ a: 1, b: 1 }))).toBeCloseTo(3.5, 10);
    expect(gpaFromBuckets(buckets({ w: 5 }))).toBeNull();
  });

  it('computes rates; W is excluded from GPA but counted in students', () => {
    const st = rowStats(buckets({ aPlus: 2, a: 3, aMinus: 5, b: 5, d: 2, f: 3, w: 5 }));
    expect(st.graded).toBe(20);
    expect(st.withdrawn).toBe(5);
    expect(st.students).toBe(25);
    expect(st.aRate).toBeCloseTo(0.5, 10);
    expect(st.wRate).toBeCloseTo(0.2, 10);
    expect(st.dfwRate).toBeCloseTo(10 / 25, 10);
    expect(rowStats(buckets({})).gpa).toBeNull();
    expect(rowStats(buckets({})).wRate).toBeNull();
  });

  it('suppresses at 9 but not at 10', () => {
    expect(isSuppressed(9)).toBe(true);
    expect(isSuppressed(10)).toBe(false);
  });

  it('normalizes sched types and flags TA types', () => {
    expect(normalizeSchedType('')).toBe('UNKNOWN');
    expect(normalizeSchedType(' onl ')).toBe('ONL');
    expect(isHeadlineSchedType('LEC')).toBe(true);
    expect(isHeadlineSchedType('dis')).toBe(false);
    expect(isHeadlineSchedType('')).toBe(true);
  });

  it('grade window boundary is inclusive at exactly ordinal − 60', () => {
    expect(termOrdinal('2026-fa') - 60).toBe(termOrdinal('2020-fa'));
    expect(inGradeWindow('2020-fa', '2026-fa', 6)).toBe(true);
    expect(inGradeWindow('2020-su', '2026-fa', 6)).toBe(false);
  });
});

// ---------- 8.2 / 8.3 aggregates ----------
describe('aggregate.ts leave-one-out delta', () => {
  const ctx = { allRows: fixtureRows, courses, scope: { kind: 'subject' } as const, subject: 'CS' };

  it('baseline includes other professors and empty-instructor rows, excludes suppressed and TA rows', () => {
    const eligible = fixtureRows.filter((r) => r.isHeadline && !r.suppressed);
    const p1 = leaveOneOutBaseline(P1, CS225, eligible);
    expect(p1.baselineN).toBe(50);
    expect(p1.baselineGpa).toBeCloseTo(3.0, 10);               // (30×3 + 10×2 + 10×4) / 50
    const p2 = leaveOneOutBaseline(P2, CS225, eligible);
    expect(p2.baselineN).toBe(40);
    expect(p2.baselineGpa).toBeCloseTo(3.5, 10);               // (20×4 + 10×2 + 10×4) / 40
  });

  it('professor aggregate within subject scope', () => {
    const agg = aggregateProfessorGrades(P1, ctx);
    expect(agg.gradeRows).toBe(1);                             // suppressed and MATH rows excluded
    expect(agg.studentsGraded).toBe(20);
    expect(agg.gpaMean).toBeCloseTo(4.0, 10);
    expect(agg.gpaDelta).toBeCloseTo(1.0, 10);
    expect(agg.deltaComparableN).toBe(20);
    expect(agg.soleInstructor).toBe(false);
    expect(agg.yearsActive).toBe(1);
    expect(agg.distribution.a).toBe(20);

    const p2 = aggregateProfessorGrades(P2, ctx);
    expect(p2.gpaDelta).toBeCloseTo(-0.5, 10);
    expect(p2.distribution.f).toBe(0);                         // TA row not in headline distribution
    const ta = p2.courses.find((c) => !c.isHeadline);
    expect(ta).toBeDefined();
    expect(ta?.graded).toBe(20);
    expect(ta?.delta).toBeNull();
  });

  it('school scope includes the other subject; course scope narrows to one course', () => {
    const school = aggregateProfessorGrades(P1, { ...ctx, scope: { kind: 'school' } });
    expect(school.gradeRows).toBe(2);
    expect(school.yearsActive).toBe(2);
    expect(school.gpaMean).toBeCloseTo((20 * 4 + 10 * 3) / 30, 10);
    // MATH 241 has no other rows → excluded from the delta but P1 is not a sole instructor overall.
    expect(school.gpaDelta).toBeCloseTo(1.0, 10);
    expect(school.soleInstructor).toBe(false);
    const course = aggregateProfessorGrades(P1, { ...ctx, scope: { kind: 'course', courseId: MATH241 } });
    expect(course.gradeRows).toBe(1);
    expect(course.soleInstructor).toBe(true);
  });

  it('soleInstructor when every course lacks a baseline', () => {
    const agg = aggregateProfessorGrades(P4, ctx);
    expect(agg.gpaDelta).toBeNull();
    expect(agg.deltaComparableN).toBe(0);
    expect(agg.soleInstructor).toBe(true);
    expect(agg.wRate).toBeCloseTo(5 / 25, 10);
    const none = aggregateProfessorGrades('uiuc:p:nobody', ctx);
    expect(none.soleInstructor).toBe(false);
    expect(none.gpaMean).toBeNull();
  });

  it('courseBreakdowns carry per-course baseline values and catalog titles', () => {
    const list = courseBreakdowns(P1, ctx);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ courseId: CS225, subject: 'CS', number: '225', title: 'Data Structures', baselineN: 50, isHeadline: true });
    expect(list[0].delta).toBeCloseTo(1.0, 10);
  });

  it('subject W rate and GPA mean over eligible rows only', () => {
    expect(subjectWRate(fixtureRows, 'CS')).toBeCloseTo(5 / 95, 10);   // 90 graded + 5 W (CS225 70 + CS498 25)
    expect(subjectGpaMean(fixtureRows, 'CS')).toBeCloseTo((20 * 4 + 30 * 3 + 10 * 2 + 10 * 4 + 20 * 4) / 90, 10);
    expect(subjectWRate(fixtureRows, 'PHYS')).toBeNull();
  });

  it('gpaByYear keeps years with n ≥ 10, sorted ascending', () => {
    const rows = [
      row({ courseId: CS225, professorId: P1, b: { b: 10 }, year: 2024 }),
      row({ courseId: CS225, professorId: P1, b: { a: 20 }, year: 2023 }),
      row({ courseId: CS225, professorId: P1, b: { a: 5 }, year: 2022 }),
    ];
    expect(gpaByYear(rows)).toEqual([{ year: 2023, gpa: 4, n: 20 }, { year: 2024, gpa: 3, n: 10 }]);
  });
});

// ---------- 8.4 rating ----------
describe('rating.ts', () => {
  it('shrinkage: (3×5 + 5×3.7) / 8 = 4.19', () => {
    expect(shrinkRating(5, 3, 3.7)).toBeCloseTo(4.1875, 6);
    expect(Number(shrinkRating(5, 3, 3.7)?.toFixed(2))).toBe(4.19);
    expect(shrinkRating(null, 0, 3.7)).toBeNull();
  });

  it('prior falls back to 3.7 below 20 reviews', () => {
    const nineteen = Array.from({ length: 19 }, () => review(5));
    expect(priorMean(nineteen)).toBe(3.7);
    const twenty = Array.from({ length: 20 }, () => review(4));
    expect(priorMean(twenty)).toBe(4);
    expect(ratingRaw([])).toBeNull();
  });

  it('confidence label boundaries 4/5/14/15', () => {
    expect(confidenceLabel(4)).toBe('low');
    expect(confidenceLabel(5)).toBe('medium');
    expect(confidenceLabel(14)).toBe('medium');
    expect(confidenceLabel(15)).toBe('high');
  });

  it('reviewScores derives every review field', () => {
    const rs = reviewScores([
      review(5, { difficulty: 2, wouldTakeAgain: true }),
      review(4, { difficulty: 4, wouldTakeAgain: false }),
      review(2, { difficulty: null, wouldTakeAgain: null }),
    ], 3.7);
    expect(rs.reviewCount).toBe(3);
    expect(rs.ratingRaw).toBeCloseTo(11 / 3, 10);
    expect(rs.ratingShrunk).toBeCloseTo((11 + 5 * 3.7) / 8, 10);
    expect(rs.difficultyMean).toBe(3);
    expect(rs.wouldTakeAgainPct).toBe(50);
    expect(rs.positiveCount).toBe(2);
    expect(rs.criticalCount).toBe(1);
    expect(rs.confidence).toBe('low');
    expect(reviewScores([], 3.7)).toMatchObject({ ratingRaw: null, ratingShrunk: null, wouldTakeAgainPct: null, difficultyMean: null });
  });
});

// ---------- 8.5 composite ----------
describe('composite.ts', () => {
  it('substitutes 0.5 for null grade / would-take-again inputs', () => {
    expect(composite(5, null, null)).toBe(80);          // 60 + 12.5 + 7.5
    expect(composite(3, 0.75, 100)).toBe(70);           // 30 + 25 + 15
    expect(composite(1, -0.75, 0)).toBe(0);
    expect(composite(1, -2, 0)).toBe(0);                // clamp G
    expect(composite(5, 0, 50)).toBe(80);               // G = 0.5 explicitly
    expect(composite(null, 0.5, 90)).toBeNull();
  });
  it('round1', () => {
    expect(round1(67.86)).toBe(67.9);
    expect(round1(1.04)).toBe(1);
  });
});

// ---- MULTI_SCHOOL_DESIGN §4.1 percent-only sources and row weights ----
describe('aggregate.ts percent-only rows (§4.1)', () => {
  const P = 'purdue:g:one';
  const Q = 'purdue:g:two';
  const C1 = 'purdue:CS:180';
  // Every section: buckets sum to 100, graded = 100, weight 1 → sections weigh equally.
  const sec = (professorId: string | null, b: Partial<GradeBuckets>, year = 2024, courseId = C1) =>
    row({ courseId, professorId, b, year, percentOnly: true });
  const rows: GradeRow[] = [
    sec(P, { a: 100 }, 2024),                       // 4.0
    sec(P, { c: 100 }, 2025),                       // 2.0
    sec(Q, { b: 100 }, 2024),
    sec(Q, { b: 100 }, 2025),
    sec(null, { a: 50, b: 50 }, 2025),              // empty-instructor section → baseline
  ];
  const ctx = { allRows: rows, courses: [], scope: { kind: 'subject' } as const, subject: 'CS' };

  it('helpers: weights, scaling and the percent-only predicate', () => {
    expect(rowWeight({ weight: undefined })).toBe(1);
    expect(rowWeight({ weight: 2.5 })).toBe(2.5);
    expect(rowWeight({ weight: -1 })).toBe(1);
    expect(scaleBuckets(buckets({ a: 3, w: 1 }), 2)).toEqual(buckets({ a: 6, w: 2 }));
    expect(sumWeightedBuckets([{ buckets: buckets({ a: 10 }), weight: 2 }, { buckets: buckets({ b: 5 }) }])).toEqual(buckets({ a: 20, b: 5 }));
    expect(isPercentOnly(rows)).toBe(true);
    expect(isPercentOnly([...rows, row({ courseId: C1, professorId: P, b: { a: 10 } })])).toBe(false);
    expect(isPercentOnly([])).toBe(false);
    expect(hasEnoughRows([rows[0]], 100)).toBe(false);      // one section is not enough …
    expect(hasEnoughRows([rows[0], rows[1]], 200)).toBe(true); // … two are (MIN_SECTIONS_N)
    expect(hasEnoughRows([row({ courseId: C1, professorId: P, b: { a: 9 } })], 9)).toBe(false); // counts keep MIN_GRADED_N
  });

  it('weights every section equally, flags countsAreEstimates and gates on MIN_SECTIONS_N', () => {
    const agg = aggregateProfessorGrades(P, ctx);
    expect(agg.countsAreEstimates).toBe(true);
    expect(agg.gradeRows).toBe(2);
    expect(agg.studentsGraded).toBe(200);                    // 100 per section, not real students
    expect(agg.gpaMean).toBeCloseTo(3.0, 10);                // (4.0 + 2.0) / 2 regardless of class size
    expect(agg.gpaByYear).toEqual([]);                       // one section per year < MIN_SECTIONS_N
    const baseline = leaveOneOutBaseline(P, C1, rows);
    expect(baseline.baselineRows).toBe(3);
    expect(baseline.baselineGpa).toBeCloseTo((3 + 3 + 3.5) / 3, 10);
    expect(agg.gpaDelta).toBeCloseTo(3.0 - (3 + 3 + 3.5) / 3, 10);
    expect(agg.deltaComparableN).toBe(200);
    // A single section is not enough evidence for a professor-level GPA or delta.
    const one = aggregateProfessorGrades(P, { ...ctx, allRows: rows.filter((r) => r.professorId !== P || r.year === 2024) });
    expect(one.gpaMean).toBeNull();
    expect(one.gpaDelta).toBeNull();
    expect(one.countsAreEstimates).toBe(true);
  });

  it('per-course baselines need MIN_SECTIONS_N other sections; a thin baseline marks the sole instructor', () => {
    const thin: GradeRow[] = [sec(P, { a: 100 }, 2024, 'purdue:CS:250'), sec(P, { b: 100 }, 2025, 'purdue:CS:250'), sec(Q, { c: 100 }, 2025, 'purdue:CS:250')];
    const agg = aggregateProfessorGrades(P, { ...ctx, allRows: thin });
    expect(agg.gpaMean).toBeCloseTo(3.5, 10);
    expect(agg.gpaDelta).toBeNull();
    expect(agg.soleInstructor).toBe(true);
    expect(courseBreakdowns(P, { ...ctx, allRows: thin })[0].delta).toBeNull();
  });

  it('row weights scale count rows in every aggregate', () => {
    const weighted: GradeRow[] = [
      row({ courseId: CS225, professorId: P1, b: { a: 10 }, weight: 3 }),   // counts as 30 A's
      row({ courseId: CS225, professorId: P1, b: { b: 10 } }),
    ];
    const agg = aggregateProfessorGrades(P1, { allRows: weighted, courses, scope: { kind: 'school' } });
    expect(agg.countsAreEstimates).toBe(false);
    expect(agg.studentsGraded).toBe(40);
    expect(agg.gpaMean).toBeCloseTo((30 * 4 + 10 * 3) / 40, 10);
    expect(agg.distribution.a).toBe(30);
  });
});
