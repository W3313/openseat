import { describe, expect, it } from 'vitest';
import type { Review, VibeTag } from '@/lib/domain/types';
import { POSITIVE_VIBE_TAGS } from '@/lib/domain/types';
import { VIBE_TAGS, getVibeLexicon, professorVibeTags, reviewVibeTags, vibeTagCounts } from '@/lib/scoring/tags';

function review(id: string, vibeTags: VibeTag[], text = ''): Review {
  return {
    id, professorId: 'uiuc:p:x', courseId: 'uiuc:CS:225', courseLabel: 'CS 225', date: '2025-05-01',
    quality: 4, difficulty: 3, wouldTakeAgain: true, gradeReceived: null, text, sourceTags: [], vibeTags,
    helpfulVotes: 0, sentiment: 0.5,
  };
}

describe('tags.ts lexicon', () => {
  it('has 6–12 lowercase phrases for each of the 12 tags', () => {
    const lexicon = getVibeLexicon();
    expect(Object.keys(lexicon).sort()).toEqual([...VIBE_TAGS].sort());
    for (const tag of VIBE_TAGS) {
      expect(lexicon[tag].length).toBeGreaterThanOrEqual(6);
      expect(lexicon[tag].length).toBeLessThanOrEqual(12);
      for (const phrase of lexicon[tag]) expect(phrase).toBe(phrase.toLowerCase().trim());
    }
    expect(VIBE_TAGS.slice(0, 6).every((t) => POSITIVE_VIBE_TAGS.has(t))).toBe(true);
  });

  it('tags a review from phrases, case-insensitive, on word boundaries', () => {
    expect(reviewVibeTags('Her lectures are so clear and EASY TO FOLLOW.')).toEqual(['clear-lectures']);
    expect(reviewVibeTags('Takes attendance every day with iClicker; tons of homework too.')).toEqual(['heavy-homework', 'strict-attendance']);
    expect(reviewVibeTags('The curve at the end saved my grade')).toEqual(['curves-generously']);
    expect(reviewVibeTags('He threw a curvedball on the final')).toEqual([]);   // "curvedball" ≠ "curved"
    expect(reviewVibeTags('')).toEqual([]);
  });
});

describe('tags.ts professor tags', () => {
  it('requires ≥ 2 reviews AND ≥ 20% of reviews', () => {
    const ten = Array.from({ length: 10 }, (_, i) => review(`r${i}`, i < 2 ? ['caring'] : i === 2 ? ['engaging'] : []));
    expect(professorVibeTags(ten)).toEqual(['caring']);                  // caring 2/10 = 20% ok; engaging 1/10 fails ≥ 2
    const eleven = [...ten, review('r10', [])];
    expect(professorVibeTags(eleven)).toEqual([]);                       // caring 2/11 = 18% fails ≥ 20%
    const two = [review('a', ['hard-exams']), review('b', ['hard-exams'])];
    expect(professorVibeTags(two)).toEqual(['hard-exams']);
    expect(professorVibeTags([review('solo', ['hard-exams'])])).toEqual([]);
    expect(professorVibeTags([])).toEqual([]);
  });

  it('shows the top 3 by frequency with positive tags first', () => {
    const reviews = Array.from({ length: 5 }, (_, i) => {
      const tags: VibeTag[] = ['heavy-homework'];
      if (i < 4) tags.push('clear-lectures');
      if (i < 3) tags.push('hard-exams');
      if (i < 2) tags.push('fast-paced');
      return review(`r${i}`, tags);
    });
    // Frequencies: heavy 5, clear 4, hard 3, fast 2 → top 3 = heavy, clear, hard → positive first.
    expect(professorVibeTags(reviews)).toEqual(['clear-lectures', 'heavy-homework', 'hard-exams']);
  });

  it('breaks frequency ties in VIBE_TAGS order', () => {
    const reviews = [review('a', ['disorganized', 'engaging']), review('b', ['disorganized', 'engaging'])];
    expect(professorVibeTags(reviews)).toEqual(['engaging', 'disorganized']);
  });

  it('vibeTagCounts uses stored tags and falls back to the text', () => {
    const counts = vibeTagCounts([
      review('a', ['caring', 'caring']),
      review('b', [], 'She genuinely cares about students and posts slides every week.'),
    ]);
    expect(counts.get('caring')).toBe(2);
    expect(counts.get('great-notes')).toBe(1);
    expect(counts.get('hard-exams')).toBeUndefined();
  });
});
