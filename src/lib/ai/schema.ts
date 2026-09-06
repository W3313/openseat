// SPEC 9.4 — structured-output schema shared by the Claude call (zodOutputFormat) and the extractive
// fallback (both outputs are validated with SummarySchema.parse before post-processing).
import { z } from 'zod';

export const SummarySchema = z.object({
  verdict: z.string().max(160),
  teachingStyle: z.array(z.string().max(40)).min(2).max(4),
  strengths: z.array(z.string().max(90)).min(2).max(4),
  watchOuts: z.array(z.string().max(90)).min(1).max(3),
  bestFor: z.string().max(140),
  workload: z.enum(['light', 'moderate', 'heavy']),
  format: z.enum(['lecture-heavy', 'discussion', 'project-based', 'mixed']),
  confidence: z.enum(['low', 'medium', 'high']), // overwritten after parse (SPEC 9.6 step 3)
  evidenceReviewIds: z.array(z.string()).min(1).max(12),
});

export type SummaryOutput = z.infer<typeof SummarySchema>;

/** Field length limits, exported so the extractive builder can clamp its own phrases. */
export const SUMMARY_LIMITS = {
  verdict: 160,
  teachingStylePhrase: 40,
  strength: 90,
  watchOut: 90,
  bestFor: 140,
  evidenceMax: 12,
} as const;
