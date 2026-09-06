import { describe, expect, it } from 'vitest';
import type { GradeBuckets, GradeRow, Meeting } from '@/lib/domain/types';
import type { RawGradeRow, RawSection } from '@/lib/sources/types';
import { datasetHash } from '@/lib/utils/hash';
import { buildCourseCatalog, computeCourseStats, courseIdFromLabel, ensureCoursesExist } from '../../scripts/ingest/catalog';
import { dedupeCrossListed, mapSectionStatus } from '../../scripts/ingest/sections';
import { gradesOnlyNames, buildDepartmentIndex } from '../../scripts/ingest/professors';
import { buildSubjects, serialize } from '../../scripts/ingest/write';
import { sparklineRange } from '../../scripts/rankings/scores';

const buckets = (over: Partial<GradeBuckets> = {}): GradeBuckets => ({
  aPlus: 0, a: 0, aMinus: 0, bPlus: 0, b: 0, bMinus: 0, cPlus: 0, c: 0, cMinus: 0, dPlus: 0, d: 0, dMinus: 0, f: 0, w: 0, ...over,
});

const rawRow = (over: Partial<RawGradeRow>): RawGradeRow => ({
  year: 2025, term: 'Fall', yearTerm: '2025-fa', subject: 'CS', number: '225', title: 'Data Structures', schedType: 'LEC',
  buckets: buckets({ a: 20 }), students: 20, instructorRaw: 'Okonkwo, Adaeze', ...over,
});

const meeting = (over: Partial<Meeting> = {}): Meeting => ({ days: ['M', 'W'], start: '10:00', end: '10:50', building: 'Harrow Hall', room: '210', type: 'LEC', ...over });

const rawSection = (over: Partial<RawSection>): RawSection => ({
  crn: '65054', subject: 'CS', number: '425', sectionCode: 'AL1', statusCode: 'open', seatsKnown: true, instructorsRaw: ['Okonkwo, A'], meetings: [meeting()], ...over,
});

describe('buildCourseCatalog', () => {
  it('collapses distinct (subject, number) and keeps the most recent title', () => {
    const courses = buildCourseCatalog(
      [
        rawRow({ yearTerm: '2023-fa', title: 'Old Title' }),
        rawRow({ yearTerm: '2025-sp', title: 'Data Structures' }),
        rawRow({ yearTerm: '2024-fa', title: 'Middle Title' }),
        rawRow({ subject: 'ece', number: '120', title: 'Intro Computing' }),
      ],
      'uiuc',
    );
    expect(courses.map((c) => c.id)).toEqual(['uiuc:CS:225', 'uiuc:ECE:120']);
    expect(courses[0].title).toBe('Data Structures');
    expect(courses[0].level).toBe(200);
    expect(courses[0].gpaMean).toBeNull();
  });

  it('ensureCoursesExist adds schedule-only courses without disturbing existing ones', () => {
    const base = buildCourseCatalog([rawRow({})], 'uiuc');
    const out = ensureCoursesExist(base, 'uiuc', [{ courseId: 'uiuc:CS:225' }, { courseId: 'uiuc:CS:498' }]);
    expect(out.map((c) => c.id)).toEqual(['uiuc:CS:225', 'uiuc:CS:498']);
    expect(out[1].title).toBe('CS 498');
  });

  it('courseIdFromLabel normalizes free-text labels against the catalog', () => {
    const ids = new Set(['uiuc:CS:225']);
    expect(courseIdFromLabel('CS225', 'uiuc', ids)).toBe('uiuc:CS:225');
    expect(courseIdFromLabel('cs 225', 'uiuc', ids)).toBe('uiuc:CS:225');
    expect(courseIdFromLabel('CS 374', 'uiuc', ids)).toBeNull();
    expect(courseIdFromLabel(null, 'uiuc', ids)).toBeNull();
  });
});

describe('dedupeCrossListed', () => {
  it('merges the same (term, crn) across subjects with the alphabetically-first course as canonical', () => {
    const sections = dedupeCrossListed(
      [
        { raw: rawSection({ subject: 'ECE', number: '428', instructorsRaw: ['Okonkwo, A', ' Tsao, M'], meetings: [meeting()] }), term: '2026-fa', fetchedAt: '2026-09-03T14:12:00Z' },
        { raw: rawSection({ subject: 'CS', number: '425', instructorsRaw: ['Okonkwo, A'], meetings: [meeting(), meeting({ days: ['F'], type: 'DIS' })] }), term: '2026-fa', fetchedAt: '2026-09-03T14:10:00Z' },
        { raw: rawSection({ crn: '70001', subject: 'CS', number: '225', statusCode: 'closed' }), term: '2026-fa', fetchedAt: '2026-09-03T14:12:00Z' },
      ],
      'uiuc',
    );
    expect(sections).toHaveLength(2);
    const merged = sections.find((s) => s.crn === '65054')!;
    expect(merged.courseId).toBe('uiuc:CS:425');
    expect(merged.crossListedCourseIds).toEqual(['uiuc:ECE:428']);
    expect(merged.instructorsRaw).toEqual(['Okonkwo, A', 'Tsao, M']);
    expect(merged.meetings).toHaveLength(2);
    expect(merged.id).toBe('uiuc:s:2026-fa:65054');
    expect(merged.isOpen).toBe(true);
    expect(merged.fetchedAt).toBe('2026-09-03T14:12:00Z');
    expect(merged.professorIds).toEqual([]);
    const closed = sections.find((s) => s.crn === '70001')!;
    expect(closed.status).toBe('closed');
    expect(closed.isOpen).toBe(false);
  });

  it('maps statuses for both the demo and the real adapter', () => {
    expect(mapSectionStatus('open')).toBe('open');
    expect(mapSectionStatus('Waitlist')).toBe('waitlist');
    expect(mapSectionStatus('A')).toBe('offered');
    expect(mapSectionStatus('X')).toBe('inactive');
    expect(mapSectionStatus('')).toBe('unknown');
  });
});

describe('computeCourseStats', () => {
  const row = (over: Partial<GradeRow>): GradeRow => ({
    id: 'r', schoolId: 'uiuc', courseId: 'uiuc:CS:225', term: '2025-fa', year: 2025, schedType: 'LEC', isHeadline: true,
    instructorRaw: 'Okonkwo, Adaeze', nameKey: null, professorId: 'uiuc:p:adaeze-okonkwo', matchMethod: 'exact', matchScore: 1,
    buckets: buckets({ a: 20 }), graded: 20, withdrawn: 0, students: 20, gpa: 4, suppressed: false, ...over,
  });

  it('sums headline non-suppressed rows incl. empty-instructor rows and counts distinct professors', () => {
    const courses = buildCourseCatalog([rawRow({})], 'uiuc');
    const out = computeCourseStats(courses, [
      row({ id: 'a' }),
      row({ id: 'b', instructorRaw: '', professorId: null, matchMethod: 'unmatched', buckets: buckets({ b: 10, w: 2 }), graded: 10, withdrawn: 2, students: 12, gpa: 3 }),
      row({ id: 'c', professorId: 'uiuc:g:tsao-m', buckets: buckets({ a: 5 }), graded: 5, students: 5, suppressed: true }),
      row({ id: 'd', schedType: 'DIS', isHeadline: false, professorId: 'uiuc:g:ta-x' }),
    ]);
    expect(out[0].graded).toBe(30);
    expect(out[0].withdrawn).toBe(2);
    expect(out[0].instructorCount).toBe(1);
    expect(out[0].gpaMean).toBeCloseTo((20 * 4 + 10 * 3) / 30, 5);
    expect(out[0].wRate).toBeCloseTo(2 / 32, 5);
    expect(out[0].buckets.a).toBe(20);
    expect(out[0].buckets.b).toBe(10);
  });
});

describe('grades-only naming and subjects', () => {
  it('reconstructs display names with source casing', () => {
    expect(gradesOnlyNames('Okonkwo, J')).toEqual({ firstName: 'J', lastName: 'Okonkwo', displayName: 'J. Okonkwo' });
    expect(gradesOnlyNames('Smyth, Robert A')).toEqual({ firstName: 'Robert', lastName: 'Smyth', displayName: 'Robert Smyth' });
    expect(gradesOnlyNames('Patel')).toEqual({ firstName: '', lastName: 'Patel', displayName: 'Patel' });
  });

  it('buildDepartmentIndex reverses department names to subject codes case-insensitively', () => {
    const idx = buildDepartmentIndex({ CS: ['Computer Science'], ECE: ['Electrical and Computer Engineering', 'Computer Engineering'] });
    expect(idx.get('computer science')).toEqual(['CS']);
    expect(idx.get('computer engineering')).toEqual(['ECE']);
  });

  it('buildSubjects counts courses, professors and open sections per subject', () => {
    const courses = buildCourseCatalog([rawRow({}), rawRow({ subject: 'ECE', number: '120' })], 'uiuc');
    const sections = dedupeCrossListed([{ raw: rawSection({ subject: 'CS', number: '225' }), term: '2026-fa', fetchedAt: 'x' }], 'uiuc');
    const subjects = buildSubjects('uiuc', { CS: 'Computer Science' }, courses, [], sections, ['CS', 'ECE', 'MATH']);
    expect(subjects.map((s) => s.code)).toEqual(['CS', 'ECE', 'MATH']);
    expect(subjects[0]).toMatchObject({ name: 'Computer Science', courseCount: 1, professorCount: 0, openSectionCount: 1 });
    expect(subjects[2]).toMatchObject({ name: 'MATH', courseCount: 0, openSectionCount: 0 });
  });
});

describe('datasetHash / serialize', () => {
  it('is order-sensitive over file contents and stable for equal input', () => {
    const a = serialize({ b: 1, a: [1.23456, 2] });
    const b = serialize({ a: [1.235, 2], b: 1 });
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(datasetHash([a, b])).toBe(datasetHash([b, a]));
    expect(datasetHash([a, 'x'])).not.toBe(datasetHash(['x', a]));
    expect(datasetHash([a])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sparklineRange', () => {
  it('pads to the surrounding tenth and clamps to [0, 4]', () => {
    expect(sparklineRange([{ year: 2024, gpa: 3.27, n: 50 }, { year: 2025, gpa: 3.51, n: 40 }])).toEqual([3.1, 3.7]);
    expect(sparklineRange([{ year: 2024, gpa: 3.95, n: 50 }])).toEqual([3.8, 4]);
    expect(sparklineRange([])).toEqual([0, 4]);
  });
});
