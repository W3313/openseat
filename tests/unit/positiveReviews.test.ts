import { describe, expect, it } from 'vitest';
import type { Review } from '@/lib/domain/types';
import { QUOTE_MAX_CHARS } from '@/lib/domain/constants';
import { isPositiveCandidate, selectPositiveReviews, truncateQuote } from '@/lib/scoring/positiveReviews';

const LONG = 'This professor explains every topic clearly and the exams are fair.'; // 67 chars

function review(id: string, partial: Partial<Review> = {}): Review {
  return {
    id, professorId: 'uiuc:p:x', courseId: 'uiuc:CS:225', courseLabel: 'CS 225', date: '2025-05-01',
    quality: 5, difficulty: 3, wouldTakeAgain: true, gradeReceived: null, text: LONG, sourceTags: [], vibeTags: [],
    helpfulVotes: 0, sentiment: 0.6, ...partial,
  };
}

describe('positiveReviews.ts candidates', () => {
  it('requires quality ≥ 4, sentiment ≥ 0.2 and text ≥ 40 chars', () => {
    expect(isPositiveCandidate(review('a'))).toBe(true);
    expect(isPositiveCandidate(review('b', { quality: 4, sentiment: 0.2, text: 'x'.repeat(40) }))).toBe(true);
    expect(isPositiveCandidate(review('c', { quality: 3 }))).toBe(false);
    expect(isPositiveCandidate(review('d', { sentiment: 0.19 }))).toBe(false);
    expect(isPositiveCandidate(review('e', { text: 'x'.repeat(39) }))).toBe(false);
  });
});

describe('positiveReviews.ts selection', () => {
  it('orders by helpfulVotes desc then date desc and stores 3', () => {
    const picked = selectPositiveReviews([
      review('old', { helpfulVotes: 2, date: '2024-01-01', courseId: 'uiuc:CS:1' }),
      review('new', { helpfulVotes: 2, date: '2025-01-01', courseId: 'uiuc:CS:2' }),
      review('top', { helpfulVotes: 9, date: '2023-01-01', courseId: 'uiuc:CS:3' }),
      review('low', { helpfulVotes: 0, date: '2025-06-01', courseId: 'uiuc:CS:4' }),
    ]);
    expect(picked.map((r) => r.id)).toEqual(['top', 'new', 'old']);
  });

  it('takes at most 2 from the same course', () => {
    const picked = selectPositiveReviews([
      review('x10', { helpfulVotes: 10 }),
      review('x9', { helpfulVotes: 9 }),
      review('x8', { helpfulVotes: 8 }),
      review('x7', { helpfulVotes: 7 }),
      review('y1', { helpfulVotes: 1, courseId: 'uiuc:CS:241' }),
    ]);
    expect(picked.map((r) => r.id)).toEqual(['x10', 'x9', 'y1']);
  });

  it('fills with quality ≥ 4 regardless of sentiment when fewer than 2 candidates', () => {
    const picked = selectPositiveReviews([
      review('cand', { helpfulVotes: 0 }),
      review('meh', { sentiment: 0.0, helpfulVotes: 5, courseId: 'uiuc:CS:241' }),
      review('flat', { sentiment: -0.1, helpfulVotes: 1, courseId: 'uiuc:CS:374' }),
      review('bad', { quality: 3, sentiment: 0.9, helpfulVotes: 99 }),
    ]);
    expect(picked.map((r) => r.id)).toEqual(['cand', 'meh', 'flat']);
  });

  it('does not fill when 2 candidates exist, and returns what exists otherwise', () => {
    const two = selectPositiveReviews([
      review('a', { courseId: 'uiuc:CS:1' }),
      review('b', { courseId: 'uiuc:CS:2' }),
      review('c', { sentiment: 0.0, courseId: 'uiuc:CS:3' }),
    ]);
    expect(two.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(selectPositiveReviews([review('only', { quality: 2 })])).toEqual([]);
    expect(selectPositiveReviews([])).toEqual([]);
    expect(selectPositiveReviews([review('a'), review('b'), review('c'), review('d')], 1)).toHaveLength(1);
  });
});

describe('positiveReviews.ts truncateQuote', () => {
  it('returns short text untouched', () => {
    expect(truncateQuote(LONG)).toBe(LONG);
    expect(truncateQuote('x'.repeat(QUOTE_MAX_CHARS))).toHaveLength(QUOTE_MAX_CHARS);
  });

  it('cuts at the last word boundary within 220 chars and appends an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`);   // ~6 chars each → ~420 chars
    const text = words.join(' ');
    const out = truncateQuote(text);
    expect(out.length).toBeLessThanOrEqual(QUOTE_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
    const body = out.slice(0, -1);
    expect(text.startsWith(body)).toBe(true);
    expect(text[body.length]).toBe(' ');                                // never mid-word
    expect(body.endsWith(' ')).toBe(false);
  });

  it('respects a custom max and strips trailing punctuation', () => {
    expect(truncateQuote('Great class, really enjoyed it', 13)).toBe('Great class…');
    expect(truncateQuote('Supercalifragilistic', 10)).toBe('Supercali…');
  });
});
