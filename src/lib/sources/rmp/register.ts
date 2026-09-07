// Registers kind `rmp-graphql` (unofficial RateMyProfessors adapter). No registered school wires it
// (docs/LEGAL.md); it only activates when a local SchoolConfig sets `sources.reviews: { kind: 'rmp-graphql' }`,
// and then RMP_AUTH_HEADER is required (no credential ships with the repo).
import { registerReviewSource } from '@/lib/sources/registry';
import { RmpReviewSource } from './RmpReviewSource';

registerReviewSource('rmp-graphql', (ctx) => {
  if (!ctx.env.RMP_AUTH_HEADER) throw new Error('RMP_AUTH_HEADER is required to wire the rmp-graphql review adapter');
  const schoolId = typeof ctx.options.rmpSchoolId === 'string' ? ctx.options.rmpSchoolId : ctx.env.RMP_SCHOOL_ID;
  return new RmpReviewSource({ schoolId, authHeader: ctx.env.RMP_AUTH_HEADER, log: ctx.log });
});
