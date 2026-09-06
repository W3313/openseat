// Shared review-text normalization for the sentiment lexicon (8.8) and vibe-tag lexicon (8.9).
// Self-contained (no dependency on the name matcher): NFKD → strip combining marks → lowercase →
// drop apostrophes → every other non-alphanumeric run becomes a single space.

/** "Dr. O’Brien's lectures are GREAT — really!" → "dr obriens lectures are great really" */
export function normalizeText(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019\u0027`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Whitespace-separated tokens of normalizeText(input). */
export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n === '' ? [] : n.split(' ');
}

/** Number of word-boundary occurrences of `phrase` (already or not yet normalized) in normalized `text`. */
export function countPhrase(normalizedText: string, phrase: string): number {
  const p = normalizeText(phrase);
  if (p === '' || normalizedText === '') return 0;
  const hay = ` ${normalizedText} `;
  const needle = ` ${p} `;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    // Advance past the leading space only, so back-to-back matches ("great great") both count.
    idx = hay.indexOf(needle, idx + needle.length - 1);
  }
  return count;
}

/** True when `phrase` occurs on word boundaries in normalized `text`. */
export function hasPhrase(normalizedText: string, phrase: string): boolean {
  return countPhrase(normalizedText, phrase) > 0;
}
