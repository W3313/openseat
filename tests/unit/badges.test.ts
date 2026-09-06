import { describe, expect, it } from 'vitest';
import type { ProfessorScores } from '@/lib/domain/types';
import { BADGE_ORDER, computeBadges, evaluateBadges, type BadgeInput } from '@/lib/scoring/badges';

function scores(partial: Partial<ProfessorScores> = {}): ProfessorScores {
  return {
    reviewCount: 10, ratingRaw: 4.0, ratingShrunk: 4.0, priorMean: 3.7, confidence: 'medium',
    difficultyMean: 3, wouldTakeAgainPct: 70, positiveCount: 6, criticalCount: 1,
    gradeRows: 4, studentsGraded: 200, withdrawn: 10,
    gpaMean: 3.3, aRate: 0.4, wRate: 0.05, dfwRate: 0.1,
    gpaDelta: 0, deltaComparableN: 200, soleInstructor: false,
    composite: 70, yearsActive: 3,
    ...partial,
  };
}

function input(partial: Partial<ProfessorScores> = {}, extra: Partial<Omit<BadgeInput, 'scores'>> = {}): BadgeInput {
  return { scores: scores(partial), openSectionCount: 0, subjectWRate: null, ...extra };
}

describe('badges.ts', () => {
  it('open-now: 0 vs 1 open section', () => {
    expect(evaluateBadges(input({}, { openSectionCount: 0 }))).not.toContain('open-now');
    expect(evaluateBadges(input({}, { openSectionCount: 1 }))).toContain('open-now');
  });

  it('tough-but-loved boundaries (delta ≤ −0.15, rating ≥ 4.2, N ≥ 50)', () => {
    const ok = { gpaDelta: -0.15, ratingShrunk: 4.2, deltaComparableN: 50 };
    expect(evaluateBadges(input(ok))).toContain('tough-but-loved');
    expect(evaluateBadges(input({ ...ok, gpaDelta: -0.14 }))).not.toContain('tough-but-loved');
    expect(evaluateBadges(input({ ...ok, ratingShrunk: 4.19 }))).not.toContain('tough-but-loved');
    expect(evaluateBadges(input({ ...ok, deltaComparableN: 49 }))).not.toContain('tough-but-loved');
    expect(evaluateBadges(input({ ...ok, gpaDelta: null }))).not.toContain('tough-but-loved');
    expect(evaluateBadges(input({ ...ok, ratingShrunk: null }))).not.toContain('tough-but-loved');
  });

  it('easy-a boundaries (delta ≥ +0.25, N ≥ 50)', () => {
    expect(evaluateBadges(input({ gpaDelta: 0.25, deltaComparableN: 50 }))).toContain('easy-a');
    expect(evaluateBadges(input({ gpaDelta: 0.24, deltaComparableN: 50 }))).not.toContain('easy-a');
    expect(evaluateBadges(input({ gpaDelta: 0.25, deltaComparableN: 49 }))).not.toContain('easy-a');
    expect(evaluateBadges(input({ gpaDelta: null, deltaComparableN: 500 }))).not.toContain('easy-a');
  });

  it('hidden-gem boundaries (raw ≥ 4.5, 3 ≤ reviews ≤ 7)', () => {
    expect(evaluateBadges(input({ ratingRaw: 4.5, reviewCount: 3 }))).toContain('hidden-gem');
    expect(evaluateBadges(input({ ratingRaw: 4.5, reviewCount: 7 }))).toContain('hidden-gem');
    expect(evaluateBadges(input({ ratingRaw: 4.5, reviewCount: 8 }))).not.toContain('hidden-gem');
    expect(evaluateBadges(input({ ratingRaw: 4.5, reviewCount: 2 }))).not.toContain('hidden-gem');
    expect(evaluateBadges(input({ ratingRaw: 4.49, reviewCount: 5 }))).not.toContain('hidden-gem');
    expect(evaluateBadges(input({ ratingRaw: null, reviewCount: 5 }))).not.toContain('hidden-gem');
  });

  it('low-withdrawal boundaries (wRate ≤ ½ subject, students ≥ 50, subjectWRate ≥ 0.02)', () => {
    const base = { wRate: 0.02, studentsGraded: 45, withdrawn: 5 };            // 50 students
    expect(evaluateBadges(input(base, { subjectWRate: 0.04 }))).toContain('low-withdrawal');
    expect(evaluateBadges(input({ ...base, wRate: 0.021 }, { subjectWRate: 0.04 }))).not.toContain('low-withdrawal');
    expect(evaluateBadges(input({ ...base, withdrawn: 4 }, { subjectWRate: 0.04 }))).not.toContain('low-withdrawal');
    expect(evaluateBadges(input({ ...base, wRate: null }, { subjectWRate: 0.04 }))).not.toContain('low-withdrawal');
    expect(evaluateBadges(input(base, { subjectWRate: null }))).not.toContain('low-withdrawal');
  });

  it('low-withdrawal requires subjectWRate ≥ 0.02', () => {
    const base = { wRate: 0.005, studentsGraded: 500, withdrawn: 5 };
    expect(evaluateBadges(input(base, { subjectWRate: 0.019 }))).not.toContain('low-withdrawal');
    expect(evaluateBadges(input(base, { subjectWRate: 0.02 }))).toContain('low-withdrawal');
  });

  it('ordering follows BADGE_ORDER and computeBadges caps at 3', () => {
    const all = input(
      { gpaDelta: -0.3, ratingShrunk: 4.6, ratingRaw: 4.8, reviewCount: 5, deltaComparableN: 120, wRate: 0.01, studentsGraded: 100, withdrawn: 2 },
      { openSectionCount: 2, subjectWRate: 0.05 },
    );
    const evaluated = evaluateBadges(all);
    expect(evaluated).toEqual(['open-now', 'tough-but-loved', 'hidden-gem', 'low-withdrawal']);
    expect(computeBadges(all)).toEqual(['open-now', 'tough-but-loved', 'hidden-gem']);
    expect(BADGE_ORDER).toEqual(['open-now', 'tough-but-loved', 'easy-a', 'hidden-gem', 'low-withdrawal']);
    // Without open-now the fourth badge surfaces.
    const noOpen = { ...all, openSectionCount: 0 };
    expect(computeBadges(noOpen)).toEqual(['tough-but-loved', 'hidden-gem', 'low-withdrawal']);
  });

  it('tough-but-loved and easy-a are mutually exclusive; nothing holds on an empty professor', () => {
    expect(evaluateBadges(input({ gpaDelta: 0.5, deltaComparableN: 100, ratingShrunk: 4.9 }))).toEqual(['easy-a']);
    expect(evaluateBadges(input({
      reviewCount: 0, ratingRaw: null, ratingShrunk: null, gpaDelta: null, deltaComparableN: 0, wRate: null, studentsGraded: 0, withdrawn: 0,
    }))).toEqual([]);
  });
});
