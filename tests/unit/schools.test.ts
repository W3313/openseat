// src/lib/config/schools — the registry (MULTI_SCHOOL_DESIGN §2): configs, allowlist, id validation, buildSchool.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHOOL_ID, DEMO, DEMO_SUBJECTS, PURDUE, REGISTERED_SCHOOL_IDS, SCHOOL_CONFIGS, SCHOOL_IDS, SCHOOL_ID_RE, UCSB, UH, UIUC, UIUC_SUBJECTS, UTD,
  buildSchool, enabledSchoolIds, findSchoolConfig, getSchoolConfig, isRegisteredSchoolId, openToggleLabel, parseSchoolsAllowlist,
  processedDirName, reviewsAvailableFor, schoolConfigDir, toRegisteredSchoolId, toSchoolId,
} from '@/lib/config/schools';

describe('school registry', () => {
  it('registers the five real grades-only schools first and the fictional demo last', () => {
    expect(REGISTERED_SCHOOL_IDS).toEqual(['uiuc', 'purdue', 'ucsb', 'uh', 'utd', 'demo']);
    expect(Object.keys(SCHOOL_CONFIGS).sort()).toEqual(['demo', 'purdue', 'ucsb', 'uh', 'uiuc', 'utd']);
    for (const c of [UIUC, PURDUE, UCSB, UH, UTD]) {
      expect(c.mode).toBe('live');
      expect(c.sources.reviews).toBeNull();
      expect(c.subjects.length).toBeGreaterThanOrEqual(15);
      expect(new Set(c.subjects).size).toBe(c.subjects.length);
      expect(c.attribution.grades.length).toBeGreaterThan(20);
      expect(SCHOOL_CONFIGS[c.id]).toBe(c);
    }
    expect(PURDUE.gradeValueKind).toBe('percent');
    expect(UH.gradeBuckets).toBe('letter-with-w');
    expect(UTD.sources.schedule).toBeNull();
    expect(UCSB.sources.schedule).toEqual({ kind: 'ucsb-curriculums', seats: false });
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

    expect(DEMO.mode).toBe('demo');
    expect(DEMO.sources.reviews).toEqual({ kind: 'demo-reviews' });
    expect(DEMO.subjects).toEqual([...DEMO_SUBJECTS]);
    expect(DEMO.seatStatusAvailable).toBe(true);
    expect(schoolConfigDir(DEMO)).toBe('data/config/uiuc'); // fictional professors on the UIUC catalog
    expect(schoolConfigDir(UIUC)).toBe('data/config/uiuc');
  });

  it('parses the SCHOOLS allowlist in registry order and ignores unknown ids', () => {
    expect(parseSchoolsAllowlist(undefined)).toEqual([...REGISTERED_SCHOOL_IDS]);
    expect(parseSchoolsAllowlist('')).toEqual([...REGISTERED_SCHOOL_IDS]);
    expect(parseSchoolsAllowlist('demo,uiuc')).toEqual(['uiuc', 'demo']);
    expect(parseSchoolsAllowlist('utd,uh,purdue')).toEqual(['purdue', 'uh', 'utd']);
    expect(parseSchoolsAllowlist(' DEMO ')).toEqual(['demo']);
    expect(parseSchoolsAllowlist('mit')).toEqual([]);
    expect(enabledSchoolIds({ SCHOOLS: 'uiuc' })).toEqual(['uiuc']);
    expect(enabledSchoolIds({ SCHOOLS: 'mit' })).toEqual([...REGISTERED_SCHOOL_IDS]); // nothing valid → everything
    expect(SCHOOL_IDS.length).toBeGreaterThan(0);
    expect(REGISTERED_SCHOOL_IDS).toEqual(expect.arrayContaining([...SCHOOL_IDS]));
    expect(SCHOOL_IDS).toContain(DEFAULT_SCHOOL_ID);
  });

  it('validates ids: toSchoolId (enabled) and toRegisteredSchoolId (any registered)', () => {
    expect(toRegisteredSchoolId('UIUC')).toBe('uiuc');
    expect(toRegisteredSchoolId('demo')).toBe('demo');
    expect(toRegisteredSchoolId('mit')).toBeNull();
    expect(toRegisteredSchoolId(null)).toBeNull();
    expect(isRegisteredSchoolId('Demo')).toBe(true);
    for (const id of SCHOOL_IDS) expect(toSchoolId(id.toUpperCase())).toBe(id);
    expect(toSchoolId('mit')).toBeNull();
    expect(toSchoolId(undefined)).toBeNull();
    expect(getSchoolConfig('demo')).toBe(DEMO);
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
    const demo = buildSchool(DEMO, { currentTerm: '2027-sp' });
    expect(demo.reviewsAvailable).toBe(true);
    expect(demo.currentTerm).toBe('2027-sp');
    expect(demo.sources.reviews).toBe('demo-reviews');
    expect(reviewsAvailableFor(demo)).toBe(true);
    expect(reviewsAvailableFor(UIUC)).toBe(false);
    const noSchedule = buildSchool({ ...UIUC, id: 'utd', sources: { ...UIUC.sources, schedule: null } });
    expect(noSchedule.sources.schedule).toBe('none');
  });

  it('keeps the compatibility helpers', () => {
    expect(processedDirName('uiuc')).toBe('uiuc');
    expect(processedDirName('demo', 'live')).toBe('demo');
    expect(openToggleLabel({ seatStatusAvailable: true })).toBe('Open seats only');
    expect(openToggleLabel({ seatStatusAvailable: false })).toBe('Offered this term');
  });
});
