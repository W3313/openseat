// SPEC 7.1 — the matcher's canonical normalization. It re-exports `normalizeName` from the slug
// utility so slugs and match keys can never diverge (the SPEC lists the steps; slug.ts implements them).
import { normalizeName } from '@/lib/utils/slug';

/** SPEC 7.1 normalization (NFKD, marks, ø/æ/ß/ł/đ/œ, lowercase, apostrophes, separators, suffixes, titles). */
export function normalize(input: string): string {
  return normalizeName(input);
}

/** Multi-token surname particles (SPEC 7.2 no-comma form): "Anna van der Berg" → last = "van der berg". */
export const PARTICLES: ReadonlySet<string> = new Set([
  'van', 'von', 'de', 'del', 'della', 'der', 'den', 'da', 'di', 'la', 'le', 'du', 'dos', 'das',
  'ter', 'st', 'bin', 'ibn', 'al', 'el', 'mac', 'mc',
]);
