import { describe, expect, it } from 'vitest';
import { AFINN_MINI, lexiconScore, sentimentScore } from '@/lib/scoring/sentiment';
import { normalizeText } from '@/lib/scoring/text';

describe('sentiment.ts lexicon', () => {
  it('bundles roughly 200 scored words in −3..3', () => {
    const entries = Object.entries(AFINN_MINI);
    expect(entries.length).toBeGreaterThanOrEqual(180);
    for (const [word, score] of entries) {
      expect(word).toMatch(/^[a-z]+$/);
      expect(Number.isInteger(score)).toBe(true);
      expect(Math.abs(score)).toBeLessThanOrEqual(3);
      expect(score).not.toBe(0);
    }
    expect(AFINN_MINI.amazing).toBe(3);
    expect(AFINN_MINI.worst).toBe(-3);
  });

  it('normalizes text: case, diacritics, apostrophes, punctuation', () => {
    expect(normalizeText("Dr. O’Brien's lectures are GREAT — really!")).toBe('dr obriens lectures are great really');
    expect(normalizeText('Café  über  naïve')).toBe('cafe uber naive');
    expect(normalizeText('')).toBe('');
  });

  it('matches on word boundaries only', () => {
    expect(lexiconScore('greatly')).toBe(0);            // "greatly" is not "great"
    expect(lexiconScore('GREAT!')).toBeCloseTo(2 / 3, 10);
    expect(lexiconScore('hate hate hate')).toBe(-1);    // −9 / (3 × 3)
    expect(lexiconScore('')).toBe(0);
  });
});

describe('sentiment.ts formula on five hand-written texts', () => {
  it('"Amazing professor", quality 5 → 1.0', () => {
    expect(lexiconScore('Amazing professor')).toBe(1);
    expect(sentimentScore(5, 'Amazing professor')).toBeCloseTo(1.0, 10);
  });

  it('"Boring and confusing lectures", quality 2 → −0.55', () => {
    expect(lexiconScore('Boring and confusing lectures')).toBeCloseTo(-4 / 6, 10);
    expect(sentimentScore(2, 'Boring and confusing lectures')).toBeCloseTo(-0.55, 10);
  });

  it('"The homework was hard but she is great", quality 4 → 0.40', () => {
    expect(lexiconScore('The homework was hard but she is great')).toBeCloseTo(1 / 6, 10);
    expect(sentimentScore(4, 'The homework was hard but she is great')).toBeCloseTo(0.4, 10);
  });

  it('"Lectures at noon in the auditorium", quality 3 → 0 (no lexicon hits)', () => {
    expect(lexiconScore('Lectures at noon in the auditorium')).toBe(0);
    expect(sentimentScore(3, 'Lectures at noon in the auditorium')).toBe(0);
  });

  it('"WORST. Class. Ever!!! Terrible, awful, useless.", quality 1 → −1 (clamped)', () => {
    const text = 'WORST. Class. Ever!!! Terrible, awful, useless.';
    expect(lexiconScore(text)).toBe(-1);
    expect(sentimentScore(1, text)).toBe(-1);
  });

  it('clamps and tolerates out-of-range quality', () => {
    expect(sentimentScore(5, 'hate hate hate')).toBeCloseTo(0.4, 10);   // 0.7 − 0.3
    expect(sentimentScore(9, 'amazing')).toBe(1);
    expect(sentimentScore(1, '')).toBeCloseTo(-0.7, 10);
  });
});
