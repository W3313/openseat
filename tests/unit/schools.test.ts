// src/lib/config/schools — the registry (MULTI_SCHOOL_DESIGN §2): configs, allowlist, id validation, buildSchool.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_ID, PURDUE, REGISTERED_SCHOOL_IDS, SCHOOL_CONFIGS, SCHOOL_IDS, SCHOOL_ID_RE, UH, UIUC, UIUC_SUBJECTS,
  buildSchool, enabledSchoolIds, findSchoolConfig, getSchoolConfig, isRegisteredSchoolId, openToggleLabel, parseSchoolsAllowlist,
  processedDirName, reviewsAvailableFor, schoolConfigDir, toRegisteredSchoolId, toSchoolId,
} from '@/lib/config/schools';

describe('school registry', () => {
  it('registers exactly the three real grades-only schools, in landing-page order', () => {
    expect(REGISTERED_SCHOOL_IDS).toEqual(['uiuc', 'purdue', 'uh']);
    expect(Object.keys(SCHOOL_CONFIGS).sort()).toEqual(['purdue', 'uh', 'uiuc']);
    for (const c of [UIUC, PURDUE, UH]) {
      expect(c.mode).toBe('live');
      expect(c.sources.reviews).toBeNull();
      expect(c.subjects.length).toBeGreaterThanOrEqual(15);
      expect(new Set(c.subjects).size).toBe(c.subjects.length);
      expect(c.attribution.grades.length).toBeGreaterThan(20);
      expect(SCHOOL_CONFIGS[c.id]).toBe(c);
      expect(schoolConfigDir(c)).toBe(`data/config/${c.id}`);
    }
    expect(PURDUE.gradeValueKind).toBe('percent');
    expect(UH.gradeBuckets).toBe('letter-with-w');
    for (const id of REGISTERED_SCHOOL_IDS) expect(id).toMatch(SCHOOL_ID_RE);

    expect(UIUC.mode).toBe('live');
    expect(UIUC.sources).toEqual({ grades: { kind: 'uiuc-gpa-csv' }, schedule: { kind: 'uiuc-course-explorer' }, reviews: null });
    expect(UIUC.subjects).toEqual([...UIUC_SUBJECTS]);
    expect(UIUC_SUBJECTS).toHaveLength(25);
    expect(new Set(UIUC_SUBJECTS).size).toBe(25);
    expect(UIUC_SUBJECTS).toEqual(expect.arrayContaining(['CS', 'BADM', 'CHEM', 'MATH', 'ADV']));
    expect(UIUC.seatStatusAvailable).toBe(false);
    expect(UIUC.gradeBuckets).toBe('plus-minus');
    expect(UIUC.gradeValueKind).toBe('counts');
    expect(UIUC.attribution.grades).toMatch(/GPA dataset/);
    expect(UIUC.attribution.schedule).toMatch(/Course Explorer/);
  });

  it('no longer knows the removed schools (demo, utd, ucsb)', () => {
    for (const gone of ['demo', 'utd', 'ucsb']) {
      expect(isRegisteredSchoolId(gone)).toBe(false);
      expect(toRegisteredSchoolId(gone)).toBeNull();
      expect(toSchoolId(gone)).toBeNull();
      expect(findSchoolConfig(gone)).toBeNull();
      expect(() => getSchoolConfig(gone)).toThrowError(/Unknown school/);
    }
    for (const c of Object.values(SCHOOL_CONFIGS)) {
      for (const spec of [c.sources.grades, c.sources.schedule, c.sources.reviews]) expect(spec?.kind ?? 'none').not.toMatch(/^demo/);
    }
  });

  it('parses the SCHOOLS allowlist in registry order and ignores unknown ids', () => {
    expect(parseSchoolsAllowlist(undefined)).toEqual([...REGISTERED_SCHOOL_IDS]);
    expect(parseSchoolsAllowlist('')).toEqual([...REGISTERED_SCHOOL_IDS]);
    expect(parseSchoolsAllowlist('uh,uiuc')).toEqual(['uiuc', 'uh']);
    expect(parseSchoolsAllowlist('uh,purdue')).toEqual(['purdue', 'uh']);
    expect(parseSchoolsAllowlist(' PURDUE ')).toEqual(['purdue']);
    expect(parseSchoolsAllowlist('mit')).toEqual([]);
    expect(parseSchoolsAllowlist('demo')).toEqual([]);
    expect(enabledSchoolIds({ SCHOOLS: 'uiuc' })).toEqual(['uiuc']);
    expect(enabledSchoolIds({ SCHOOLS: 'mit' })).toEqual([...REGISTERED_SCHOOL_IDS]); // nothing valid → everything
    expect(SCHOOL_IDS.length).toBeGreaterThan(0);
    expect(REGISTERED_SCHOOL_IDS).toEqual(expect.arrayContaining([...SCHOOL_IDS]));
    expect(SCHOOL_IDS).toContain(DEFAULT_SCHOOL_ID);
    expect(DEFAULT_SCHOOL_ID).toBe(SCHOOL_IDS[0]);
  });

  it('validates ids: toSchoolId (enabled) and toRegisteredSchoolId (any registered)', () => {
    expect(toRegisteredSchoolId('UIUC')).toBe('uiuc');
    expect(toRegisteredSchoolId('purdue')).toBe('purdue');
    expect(toRegisteredSchoolId('mit')).toBeNull();
    expect(toRegisteredSchoolId(null)).toBeNull();
    expect(isRegisteredSchoolId('Uh')).toBe(true);
    for (const id of SCHOOL_IDS) expect(toSchoolId(id.toUpperCase())).toBe(id);
    expect(toSchoolId('mit')).toBeNull();
    expect(toSchoolId(undefined)).toBeNull();
    expect(getSchoolConfig('purdue')).toBe(PURDUE);
    expect(() => getSchoolConfig('mit')).toThrowError(/Unknown school "mit"/);
    expect(findSchoolConfig('mit')).toBeNull();
  });

  it('buildSchool derives the served School record from the config', () => {
    const uiuc = buildSchool(UIUC);
    expect(uiuc).toEqual({
      id: 'uiuc',
      name: UIUC.name,
      shortName: 'UIUC',
      mode: 'live',
      currentTerm: UIUC.currentTerm,
      timezone: 'America/Chicago',
      seatStatusAvailable: false,
      reviewsAvailable: false,
      gradeBuckets: 'plus-minus',
      gradeValueKind: 'counts',
      attribution: UIUC.attribution,
      sources: { grades: 'uiuc-gpa-csv', schedule: 'uiuc-course-explorer', reviews: 'none' },
    });
    const later = buildSchool(UH, { currentTerm: '2027-sp' });
    expect(later.currentTerm).toBe('2027-sp');
    expect(later.reviewsAvailable).toBe(false);
    expect(reviewsAvailableFor(later)).toBe(false);
    expect(reviewsAvailableFor(UIUC)).toBe(false);
    // A future first-party review source flips the switch without any other change (design §5).
    const withReviews = buildSchool({ ...UIUC, sources: { ...UIUC.sources, reviews: { kind: 'first-party' } } });
    expect(withReviews.reviewsAvailable).toBe(true);
    expect(withReviews.sources.reviews).toBe('first-party');
    expect(reviewsAvailableFor(withReviews)).toBe(true);
    const noSchedule = buildSchool({ ...UIUC, id: 'nosched', sources: { ...UIUC.sources, schedule: null } });
    expect(noSchedule.sources.schedule).toBe('none');
  });

  it('keeps the compatibility helpers', () => {
    expect(processedDirName('uiuc')).toBe('uiuc');
    expect(processedDirName('purdue', 'live')).toBe('purdue');
    expect(openToggleLabel({ seatStatusAvailable: true })).toBe('Open seats only');
    expect(openToggleLabel({ seatStatusAvailable: false })).toBe('Offered this term');
  });
});
