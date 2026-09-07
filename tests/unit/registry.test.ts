// src/lib/sources/registry — adapter kinds map, per-school resolution, null adapters (MULTI_SCHOOL_DESIGN §2, §7).
import { describe, expect, it } from 'vitest';
import { loadEnv } from '@/lib/config/env';
import type { GradeSource } from '@/lib/sources/types';
import {
  NullReviewSource, NullScheduleSource, getGradeSource, getReviewSource, getScheduleSource, getSources,
  registerGradeSource, registeredAdapterKinds,
} from '@/lib/sources/registry';

const env = loadEnv({} as NodeJS.ProcessEnv);

describe('adapter registry', () => {
  it('lists the built-in kinds registered through src/lib/sources/adapters.ts', () => {
    const kinds = registeredAdapterKinds();
    expect(kinds.grades).toEqual(expect.arrayContaining(['uiuc-gpa-csv']));
    expect(kinds.schedule).toEqual(expect.arrayContaining(['uiuc-course-explorer']));
    expect(kinds.reviews).toEqual(expect.arrayContaining(['rmp-graphql']));
    expect(kinds.grades.some((k) => k.startsWith('demo'))).toBe(false); // the fictional adapters are gone
  });

  it('accepts new kinds from a register.ts-style call and keeps them sorted', () => {
    const fake: GradeSource = { info: { id: 'test-grades', label: 'test', url: null, license: null }, fetch: async () => ({ rows: [], fetchedAt: '' }) };
    registerGradeSource('zz-test-grades', () => fake);
    const grades = registeredAdapterKinds().grades;
    expect(grades).toContain('zz-test-grades');
    expect(grades).toEqual([...grades].sort());
  });

  it('resolves each role from the school config and substitutes null adapters', async () => {
    expect(getGradeSource('uiuc', env).info.id).toBe('uiuc-gpa-csv');
    expect(getScheduleSource('uiuc', env).info.id).toBe('uiuc-course-explorer');
    const none = getReviewSource('uiuc', env);
    expect(none).toBeInstanceOf(NullReviewSource);
    expect(await none.fetchProfessors({ schoolId: 'uiuc', subjects: ['CS'] })).toEqual([]);
    expect(await none.fetchReviews('x')).toEqual([]);
    expect(getSources('purdue', env).reviews).toBeInstanceOf(NullReviewSource); // no registered school has a review source
    const nullSchedule = new NullScheduleSource();
    expect(await nullSchedule.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).toEqual({ term: '2026-fa', fetchedAt: '', sections: [] });
  });

  it('names the unknown school or kind in its error', () => {
    expect(() => getSources('mit', env)).toThrowError(/Unknown school "mit"/);
    expect(() => getSources('demo', env)).toThrowError(/Unknown school "demo"/);
  });
});
