// Course view (SPEC 3.3 / F20): badges and deltaComparableN must follow the course-scoped aggregates.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RankingsPayload } from '@/lib/domain/types';
import { computeBadges } from '@/lib/scoring/badges';
import { scopePayloadToCourse, scopeProfessor } from '@/app/s/[school]/[subject]/[number]/courseScope';

const payload = JSON.parse(readFileSync('data/processed/uiuc/rankings/CS.json', 'utf8')) as RankingsPayload;

describe('scopePayloadToCourse', () => {
  it('recomputes badges from the course-scoped scores and open sections for every course', () => {
    let checked = 0;
    for (const course of payload.courses) {
      const scoped = scopePayloadToCourse(payload, course.number);
      for (const p of scoped.professors) {
        const expected = computeBadges({ scores: p.scores, openSectionCount: p.openSections.length, subjectWRate: payload.subjectWRate });
        expect(p.badges).toEqual(expected);
        if (p.badges.includes('open-now')) expect(p.openSections.length).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('uses the professor’s own graded students in the course as deltaComparableN', () => {
    for (const course of payload.courses) {
      for (const p of payload.professors) {
        const scoped = scopeProfessor(p, course.courseId, payload.subjectWRate);
        if (!scoped) continue;
        const own = scoped.courses.filter((c) => c.isHeadline).reduce((s, c) => s + c.graded, 0);
        if (scoped.scores.gpaDelta != null) expect(scoped.scores.deltaComparableN).toBe(own);
        else expect(scoped.scores.deltaComparableN).toBe(0);
      }
    }
  });
});
