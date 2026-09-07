import { describe, expect, it } from 'vitest';
import type {
  CourseBreakdown, Professor, ProfessorScores, RankedProfessor, RankingsPayload, Section,
} from '@/lib/domain/types';
import {
  applyRankingsQuery, availableSorts, computeTotals, defaultSortFor, effectiveSort, sectionInScope, sortLowData, sortRanked,
} from '@/lib/scoring/rank';

// ---------- fixture helpers ----------
const EMPTY = { aPlus: 0, a: 0, aMinus: 0, bPlus: 0, b: 0, bMinus: 0, cPlus: 0, c: 0, cMinus: 0, dPlus: 0, d: 0, dMinus: 0, f: 0, w: 0 };

function section(crn: string, courseId: string, crossListed: string[] = []): Section {
  return {
    id: `uiuc:s:2026-fa:${crn}`, schoolId: 'uiuc', term: '2026-fa', courseId, crossListedCourseIds: crossListed,
    crn, sectionCode: 'AL1', type: 'LEC', status: 'open', seatsKnown: true, isOpen: true,
    instructorsRaw: [], professorIds: [], meetings: [], fetchedAt: '2026-08-20T00:00:00Z',
  };
}

function course(courseId: string): CourseBreakdown {
  const [, subject, number] = courseId.split(':');
  return {
    courseId, subject, number, title: `${subject} ${number}`, gradeRows: 1, graded: 50, withdrawn: 1,
    gpa: 3.2, aRate: 0.3, wRate: 0.02, dfwRate: 0.1, baselineGpa: 3.0, baselineN: 100, delta: 0.2, buckets: EMPTY, isHeadline: true,
  };
}

function prof(opts: {
  last: string; first?: string; rating?: number | null; reviews: number; delta?: number | null; composite?: number | null;
  gpaMean?: number | null; students?: number; open?: Section[]; courses?: string[]; gradeRows?: number;
}): RankedProfessor {
  const professor: Professor = {
    id: `uiuc:p:${opts.last.toLowerCase()}`, schoolId: 'uiuc', slug: opts.last.toLowerCase(), kind: opts.reviews > 0 ? 'reviewed' : 'grades-only',
    displayName: `${opts.first ?? 'Ann'} ${opts.last}`, firstName: opts.first ?? 'Ann', lastName: opts.last,
    nameKey: { raw: '', last: '', lastTokens: [], lastCompact: '', first: '', firstTokens: [], firstCompact: '', firstToken: '', firstInitial: '', middleInitials: [] },
    department: null, subjects: ['CS'], courseIds: opts.courses ?? [], nameVariants: [], reviewSourceId: null, isFictional: true,
  };
  const scores: ProfessorScores = {
    reviewCount: opts.reviews, ratingRaw: opts.rating ?? null, ratingShrunk: opts.rating ?? null, priorMean: 3.7, confidence: 'low',
    difficultyMean: null, wouldTakeAgainPct: null, positiveCount: 0, criticalCount: 0, gradeRows: opts.gradeRows ?? 1,
    studentsGraded: opts.students ?? 50, withdrawn: 0, gpaMean: opts.gpaMean ?? null, aRate: null, wRate: null, dfwRate: null,
    gpaDelta: opts.delta ?? null, deltaComparableN: 100, soleInstructor: false, composite: opts.composite ?? null, yearsActive: 1,
    countsAreEstimates: false,
  };
  return {
    rank: null, professor, scores, badges: [], vibeTags: [], distribution: EMPTY, gpaByYear: [],
    courses: (opts.courses ?? []).map(course), openSections: opts.open ?? [], sectionsThisTerm: (opts.open ?? []).length,
    positiveReviews: [], summary: null, matchProvenance: [],
  };
}

const CS225 = 'uiuc:CS:225'; const CS241 = 'uiuc:CS:241'; const CS357 = 'uiuc:CS:357'; const MATH257 = 'uiuc:MATH:257';
const s1 = section('10001', CS225);
const s2 = section('10002', CS225);
const s3 = section('10003', MATH257, [CS357]);

const A = prof({ last: 'Alpha', rating: 4.5, reviews: 10, delta: 0.2, composite: 80, gpaMean: 3.5, open: [s1], courses: [CS225] });
const B = prof({ last: 'Bravo', rating: 4.5, reviews: 12, delta: null, composite: 70, open: [s2, s1], courses: [CS241] });
const C = prof({ last: 'Charlie', rating: 4.0, reviews: 20, delta: 0.5, composite: 90, gpaMean: 3.8, courses: [CS241] });
const F = prof({ last: 'Foxtrot', rating: 4.5, reviews: 10, delta: 0.2, composite: 80, gpaMean: 3.6, courses: [CS225] });
const D = prof({ last: 'Delta', rating: null, reviews: 2, delta: 0.1, students: 100, open: [s3] });
const E = prof({ last: 'Echo', reviews: 0, delta: null, students: 200, courses: [CS357] });
const G = prof({ last: 'Golf', reviews: 1, delta: null, students: 300 });

const payload: RankingsPayload = {
  school: {
    id: 'uiuc', name: 'University of Illinois Urbana-Champaign', shortName: 'UIUC', mode: 'live', currentTerm: '2026-fa', timezone: 'America/Chicago',
    seatStatusAvailable: true, reviewsAvailable: true, gradeBuckets: 'plus-minus', gradeValueKind: 'counts',
    attribution: { grades: 'fixture' }, sources: { grades: 'fixture-grades', schedule: 'fixture-schedule', reviews: 'fixture-reviews' },
  },
  subject: { schoolId: 'uiuc', code: 'CS', name: 'Computer Science', courseCount: 4, professorCount: 7, openSectionCount: 3 },
  term: '2026-fa', scope: { kind: 'subject' }, mode: 'live', generatedAt: '2026-08-20T00:00:00Z', seatsFetchedAt: '2026-08-20T00:00:00Z',
  gradesThroughTerm: '2026-wi', termFallback: false, subjectGpaMean: 3.3, subjectWRate: 0.03, priorMean: 3.7, sparklineRange: [2.5, 4],
  courses: [], professors: [A, B, C, D, E, F, G],
};

const names = (list: readonly RankedProfessor[]) => list.map((p) => p.professor.lastName);

describe('rank.ts sort keys', () => {
  const rankedOnly = [A, B, C, F];
  it('rating: shrunk desc → reviewCount desc → gpaDelta desc (nulls last) → lastName', () => {
    expect(names(sortRanked(rankedOnly, 'rating'))).toEqual(['Bravo', 'Alpha', 'Foxtrot', 'Charlie']);
    const nullDelta = prof({ last: 'Aardvark', rating: 4.5, reviews: 10, delta: null });
    expect(names(sortRanked([nullDelta, A], 'rating'))).toEqual(['Alpha', 'Aardvark']);
  });
  it('overall: composite desc → ratingShrunk desc; null composite last', () => {
    expect(names(sortRanked(rankedOnly, 'overall'))).toEqual(['Charlie', 'Alpha', 'Foxtrot', 'Bravo']);
    const noComposite = prof({ last: 'Aardvark', rating: 5, reviews: 3, composite: null });
    expect(names(sortRanked([noComposite, C], 'overall'))).toEqual(['Charlie', 'Aardvark']);
  });
  it('gpa: gpaDelta desc (nulls last) → gpaMean desc (nulls last) → ratingShrunk desc', () => {
    expect(names(sortRanked(rankedOnly, 'gpa'))).toEqual(['Charlie', 'Foxtrot', 'Alpha', 'Bravo']);
    const noMean = prof({ last: 'Aardvark', rating: 4.9, reviews: 10, delta: 0.2, gpaMean: null });
    expect(names(sortRanked([noMean, A], 'gpa'))).toEqual(['Alpha', 'Aardvark']);
  });
  it('reviews: reviewCount desc → ratingShrunk desc → name', () => {
    expect(names(sortRanked(rankedOnly, 'reviews'))).toEqual(['Charlie', 'Bravo', 'Alpha', 'Foxtrot']);
  });
  it('is stable and does not mutate the input', () => {
    const input = [F, A];
    const out = sortRanked(input, 'rating');
    expect(names(out)).toEqual(['Alpha', 'Foxtrot']);
    expect(names(input)).toEqual(['Foxtrot', 'Alpha']);
  });
  it('lowData: gpaDelta desc (nulls last) → studentsGraded desc → lastName', () => {
    expect(names(sortLowData([E, G, D]))).toEqual(['Delta', 'Golf', 'Echo']);
  });
});

describe('rank.ts sectionInScope', () => {
  it('matches direct and cross-listed course ids', () => {
    expect(sectionInScope(s3, { kind: 'subject' }, 'CS')).toBe(true);
    expect(sectionInScope(s3, { kind: 'subject' }, 'PHYS')).toBe(false);
    expect(sectionInScope(s3, { kind: 'course', courseId: CS357 }, 'CS')).toBe(true);
    expect(sectionInScope(s3, { kind: 'course', courseId: CS225 }, 'CS')).toBe(false);
    expect(sectionInScope(s1, { kind: 'subject' }, 'cs')).toBe(true);
  });
});

describe('rank.ts applyRankingsQuery', () => {
  it('splits at 3 reviews, ranks 1..n, keeps lowData rank null', () => {
    const res = applyRankingsQuery(payload, { sort: 'rating', openOnly: false });
    expect(names(res.ranked)).toEqual(['Bravo', 'Alpha', 'Foxtrot', 'Charlie']);
    expect(res.ranked.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(names(res.lowData)).toEqual(['Delta', 'Golf', 'Echo']);
    expect(res.lowData.every((p) => p.rank === null)).toBe(true);
    expect(res.query).toEqual({ sort: 'rating', openOnly: false });
    expect(res.subject.code).toBe('CS');
    expect('professors' in res).toBe(false);
  });

  it('totals dedupe shared sections and sum reviews over both lists', () => {
    const res = applyRankingsQuery(payload, { sort: 'rating', openOnly: false });
    expect(res.totals).toEqual({ ranked: 4, lowData: 3, openSections: 3, reviews: 55 });
    expect(computeTotals([A, B], [D]).openSections).toBe(3);
  });

  it('openOnly keeps professors with ≥ 1 open section', () => {
    const res = applyRankingsQuery(payload, { sort: 'rating', openOnly: true });
    expect(names(res.ranked)).toEqual(['Bravo', 'Alpha']);
    expect(names(res.lowData)).toEqual(['Delta']);
    expect(res.totals).toEqual({ ranked: 2, lowData: 1, openSections: 3, reviews: 24 });
  });

  it('course filter keeps professors by course breakdown or by section, and narrows sections', () => {
    const res = applyRankingsQuery(payload, { sort: 'rating', openOnly: false, course: '225' });
    expect(names(res.ranked)).toEqual(['Bravo', 'Alpha', 'Foxtrot']);      // Bravo via section, Alpha/Foxtrot via courses
    expect(res.lowData).toEqual([]);
    expect(res.query.course).toBe('225');
    const open = applyRankingsQuery(payload, { sort: 'rating', openOnly: true, course: '225' });
    expect(names(open.ranked)).toEqual(['Bravo', 'Alpha']);                 // Foxtrot has no section
  });

  it('course filter honours cross-listed sections', () => {
    const res = applyRankingsQuery(payload, { sort: 'rating', openOnly: false, course: '357' });
    expect(res.ranked).toEqual([]);
    expect(names(res.lowData)).toEqual(['Delta', 'Echo']);                 // Delta via MATH 257 cross-listed CS 357
    expect(res.lowData[0].openSections.map((s) => s.crn)).toEqual(['10003']);
    const openOnly = applyRankingsQuery(payload, { sort: 'rating', openOnly: true, course: '357' });
    expect(names(openOnly.lowData)).toEqual(['Delta']);
  });

  it('normalizes the course filter and drops an empty one', () => {
    expect(applyRankingsQuery(payload, { sort: 'rating', openOnly: false, course: ' 225 ' }).query.course).toBe('225');
    expect(applyRankingsQuery(payload, { sort: 'rating', openOnly: false, course: '' }).query.course).toBeUndefined();
    expect(applyRankingsQuery(payload, { sort: 'rating', openOnly: false, course: '999' }).totals.ranked).toBe(0);
  });

  it('never mutates the payload', () => {
    const before = JSON.stringify(payload);
    applyRankingsQuery(payload, { sort: 'overall', openOnly: true, course: '225' });
    expect(JSON.stringify(payload)).toBe(before);
    expect(payload.professors.every((p) => p.rank === null)).toBe(true);
  });

  it('applies every sort key through the query', () => {
    expect(names(applyRankingsQuery(payload, { sort: 'overall', openOnly: false }).ranked)).toEqual(['Charlie', 'Alpha', 'Foxtrot', 'Bravo']);
    expect(names(applyRankingsQuery(payload, { sort: 'gpa', openOnly: false }).ranked)).toEqual(['Charlie', 'Foxtrot', 'Alpha', 'Bravo']);
    expect(names(applyRankingsQuery(payload, { sort: 'reviews', openOnly: false }).ranked)).toEqual(['Charlie', 'Bravo', 'Alpha', 'Foxtrot']);
  });
});

describe('rank.ts grades-only mode (MULTI_SCHOOL_DESIGN §5)', () => {
  const gradesOnly: RankingsPayload = {
    ...payload,
    school: { ...payload.school, id: 'uiuc', mode: 'live', reviewsAvailable: false, sources: { grades: 'uiuc-gpa-csv', schedule: 'uiuc-course-explorer', reviews: 'none' } },
    professors: [
      prof({ last: 'Alpha', reviews: 0, delta: 0.2, gpaMean: 3.5, courses: [CS225] }),
      prof({ last: 'Bravo', reviews: 0, delta: 0.5, gpaMean: 3.8, courses: [CS241] }),
      prof({ last: 'Charlie', reviews: 0, delta: null, gpaMean: 3.1, students: 40 }),
      prof({ last: 'Delta', reviews: 0, delta: null, gpaMean: null, gradeRows: 0, students: 0, open: [s3] }),   // sections only → lowData
    ],
  };

  it('defaults to gpa, treats every other sort as gpa and only offers gpa', () => {
    expect(defaultSortFor(gradesOnly.school)).toBe('gpa');
    expect(defaultSortFor(payload.school)).toBe('rating');
    expect(defaultSortFor(undefined)).toBe('rating');
    expect(effectiveSort('rating', gradesOnly.school)).toBe('gpa');
    expect(effectiveSort('overall', payload.school)).toBe('overall');
    expect(availableSorts(gradesOnly.school)).toEqual(['gpa']);
    expect(availableSorts(payload.school)).toEqual(['rating', 'overall', 'gpa', 'reviews']);
  });

  it('ranks every professor with grade rows (no MIN_REVIEWS_RANKED split) in gpa order', () => {
    const res = applyRankingsQuery(gradesOnly, { sort: 'rating', openOnly: false });
    expect(names(res.ranked)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(res.ranked.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(names(res.lowData)).toEqual(['Delta']);
    expect(res.query).toEqual({ sort: 'gpa', openOnly: false });
    expect(res.totals).toEqual({ ranked: 3, lowData: 1, openSections: 1, reviews: 0 });
    for (const key of ['overall', 'reviews', 'gpa'] as const) {
      expect(names(applyRankingsQuery(gradesOnly, { sort: key, openOnly: false }).ranked)).toEqual(['Bravo', 'Alpha', 'Charlie']);
    }
  });

  it('keeps the review split for schools with reviews (older payloads without the flag count as reviewed)', () => {
    const legacy = { ...payload, school: { ...payload.school } } as RankingsPayload;
    delete (legacy.school as Partial<typeof legacy.school>).reviewsAvailable;
    const res = applyRankingsQuery(legacy, { sort: 'rating', openOnly: false });
    expect(names(res.ranked)).toEqual(['Bravo', 'Alpha', 'Foxtrot', 'Charlie']);
    expect(res.query.sort).toBe('rating');
  });
});
