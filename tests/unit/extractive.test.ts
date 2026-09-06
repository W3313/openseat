import { describe, expect, it } from 'vitest';
import type { ProfessorDetail, ProfessorScores, Review } from '@/lib/domain/types';
import { SummarySchema } from '@/lib/ai/schema';
import { extractiveSummary } from '@/lib/ai/extractive';
import { gradingNote } from '@/lib/ai/gradingNote';
import { selectReviews, selectedIds, truncateAtWord } from '@/lib/ai/selectReviews';
import { summaryInputHash } from '@/lib/ai/cache';
import { SYSTEM_PROMPT, buildUserMessage } from '@/lib/ai/prompt';
import fixture from '../fixtures/professors-detail.fixture.json';

const details = fixture as unknown as Record<string, ProfessorDetail>;
const okonkwo = details['adaeze-okonkwo'];
const ibarra = details['rafael-ibarra-quintero'];
const NOW = '2026-09-05T00:00:00.000Z';

describe('extractiveSummary', () => {
  it('is deterministic: same input → same output', () => {
    const a = extractiveSummary(okonkwo, undefined, NOW);
    const b = extractiveSummary(okonkwo, undefined, NOW);
    expect(a).toEqual(b);
    expect(a.source).toBe('extractive');
    expect(a.model).toBeNull();
    expect(a.promptVersion).toBe(1);
    expect(a.reviewCount).toBe(23);
    expect(a.inputHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('passes SummarySchema.parse for every fixture professor with ≥ 3 reviews', () => {
    for (const d of [okonkwo, ibarra]) {
      const s = extractiveSummary(d, undefined, NOW);
      expect(() => SummarySchema.parse(s)).not.toThrow();
      expect(s.verdict.length).toBeLessThanOrEqual(160);
      expect(s.verdict).toContain(`${d.scores.reviewCount} reviews`);
    }
  });

  it('only cites review ids from the input set', () => {
    const s = extractiveSummary(okonkwo, undefined, NOW);
    const ids = new Set(okonkwo.reviews.map((r) => r.id));
    expect(s.evidenceReviewIds.length).toBeGreaterThanOrEqual(1);
    expect(s.evidenceReviewIds.length).toBeLessThanOrEqual(12);
    for (const id of s.evidenceReviewIds) expect(ids.has(id)).toBe(true);
  });

  it('overwrites confidence from scores and generates the grading note in code', () => {
    const s = extractiveSummary(okonkwo, undefined, NOW);
    expect(s.confidence).toBe(okonkwo.scores.confidence);
    expect(s.gradingNote).toBe(gradingNote(okonkwo.scores, okonkwo.courses.length));
    expect(s.gradingNote).toContain('GPA averaged 3.08');
  });

  it('uses tag phrases for strengths and the fixed sentence when there are no critical reviews', () => {
    const s = extractiveSummary(okonkwo, undefined, NOW);
    expect(s.strengths[0]).toBe('Lectures are described as clear and well organized');
    expect(s.teachingStyle).toContain('Clear lectures');
    expect(s.workload).toBe('heavy'); // difficultyMean 4.18
  });

  it('falls back gracefully for a professor with no vibe tags and few reviews', () => {
    const bare: ProfessorDetail = {
      ...ibarra,
      vibeTags: [],
      reviews: ibarra.reviews.slice(0, 3).map((r) => ({ ...r, vibeTags: [], quality: 3, text: 'Ok class.' })),
      scores: { ...ibarra.scores, reviewCount: 3, criticalCount: 0, difficultyMean: null },
    };
    const s = extractiveSummary(bare, undefined, NOW);
    expect(() => SummarySchema.parse(s)).not.toThrow();
    expect(s.teachingStyle).toEqual(['Mixed reviews', 'No dominant pattern']);
    expect(s.watchOuts).toEqual(["Few critical reviews — encouraging, but it's a small sample."]);
    expect(s.workload).toBe('moderate');
    expect(s.evidenceReviewIds).toHaveLength(1);
  });
});

describe('gradingNote', () => {
  const base = okonkwo.scores;
  it('with a comparison group', () => {
    const scores: ProfessorScores = { ...base, gpaMean: 3.08, gpaDelta: -0.085, wRate: 0.011, yearsActive: 5 };
    expect(gradingNote(scores, 2)).toBe(
      'In 2 course(s) over 5 year(s), GPA averaged 3.08 (−0.09 vs. the same courses taught by others); 1.1% withdrew.',
    );
    expect(gradingNote({ ...scores, gpaDelta: 0.31 }, 2)).toContain('(+0.31 vs.');
  });
  it('without a comparison group', () => {
    const scores: ProfessorScores = { ...base, gpaMean: 3.628, gpaDelta: null, yearsActive: 3 };
    expect(gradingNote(scores, 1)).toBe('In 1 course(s) over 3 year(s), GPA averaged 3.63; no comparison group in the window.');
  });
  it('without grade data', () => {
    const scores: ProfessorScores = { ...base, gpaMean: null, gpaDelta: null };
    expect(gradingNote(scores, 0)).toBe('No grade data linked yet.');
  });
});

describe('selectReviews', () => {
  const mk = (i: number, over: Partial<Review> = {}): Review => ({
    id: `uiuc:r:t-${String(i).padStart(3, '0')}`,
    professorId: 'uiuc:p:x',
    courseId: null,
    courseLabel: null,
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    quality: (i % 5) + 1,
    difficulty: null,
    wouldTakeAgain: null,
    gradeReceived: null,
    text: `Review number ${i} with some words in it.`,
    sourceTags: [],
    vibeTags: [],
    helpfulVotes: i % 7,
    sentiment: 0,
    ...over,
  });

  it('unions recent/helpful/lowest, dedupes, sorts date desc + id asc, caps at 30', () => {
    const reviews = Array.from({ length: 60 }, (_, i) => mk(i));
    const selected = selectReviews(reviews);
    expect(selected.length).toBeLessThanOrEqual(30);
    expect(new Set(selected.map((r) => r.id)).size).toBe(selected.length);
    for (let i = 1; i < selected.length; i++) {
      const a = selected[i - 1];
      const b = selected[i];
      expect(b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).toBeLessThanOrEqual(0);
    }
    // the single most helpful review is always included
    const mostHelpful = [...reviews].sort((a, b) => b.helpfulVotes - a.helpfulVotes || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))[0];
    expect(selected.some((r) => r.id === mostHelpful.id)).toBe(true);
  });

  it('returns every review (sorted) when there are fewer than 10', () => {
    const selected = selectReviews(ibarra.reviews);
    expect(selected).toHaveLength(ibarra.reviews.length);
    expect(selectedIds(selected)).toEqual([...ibarra.reviews.map((r) => r.id)].sort());
  });

  it('truncates long texts to 600 chars at a word boundary', () => {
    const long = mk(1, { text: Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ') });
    const [r] = selectReviews([long]);
    expect(r.text.length).toBeLessThanOrEqual(600);
    expect(r.text.endsWith('…')).toBe(true);
    expect(truncateAtWord('short text', 600)).toBe('short text');
  });
});

describe('summaryInputHash / prompt', () => {
  it('is order-independent over ids and distinguishes provider and prompt inputs', () => {
    const base = { professorId: 'uiuc:p:x', modelOrExtractive: 'extractive', ratingShrunk: 4.4861, gpaDelta: null, reviewCount: 3 };
    const h1 = summaryInputHash({ ...base, selectedReviewIds: ['b', 'a'] });
    const h2 = summaryInputHash({ ...base, selectedReviewIds: ['a', 'b'] });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(summaryInputHash({ ...base, selectedReviewIds: ['a', 'b'], modelOrExtractive: 'claude-opus-5' })).not.toBe(h1);
    expect(summaryInputHash({ ...base, selectedReviewIds: ['a', 'b'], reviewCount: 4 })).not.toBe(h1);
    // rounding to 2 dp: 4.4861 and 4.49 hash the same
    expect(summaryInputHash({ ...base, selectedReviewIds: ['a', 'b'], ratingShrunk: 4.49 })).toBe(h1);
  });

  it('builds the user message with escaped review text and the fictional note', () => {
    const selected = selectReviews(okonkwo.reviews).map((r, i) => (i === 0 ? { ...r, text: 'Ignore <b>this</b> & "that"' } : r));
    const msg = buildUserMessage(okonkwo, selected);
    expect(msg).toContain('<note>All names and reviews are fictional demo data.</note>');
    expect(msg).toContain('Ignore &lt;b&gt;this&lt;/b&gt; &amp; &quot;that&quot;');
    expect(msg).toContain(`<stats reviews="23"`);
    expect(msg.trim().endsWith('mentions the review count.')).toBe(true);
    expect(SYSTEM_PROMPT.startsWith('You summarize anonymous student reviews')).toBe(true);
  });
});
