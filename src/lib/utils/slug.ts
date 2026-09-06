// Slugs and the name normalization they are built on (SPEC 5.1, 7.1).
//
// `normalizeName` implements SPEC 7.1 exactly; `src/lib/matching/normalize.ts` is the matcher's canonical
// home for it and may simply re-export this function so slugs and match keys can never diverge.

const SUFFIXES: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);
const TITLES: ReadonlySet<string> = new Set(['dr', 'prof', 'professor', 'mr', 'mrs', 'ms']);

/** Letters that do not decompose under NFKD (SPEC 7.1 step 1). */
const NON_DECOMPOSABLE: Record<string, string> = {
  ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', ß: 'ss', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', œ: 'oe', Œ: 'oe',
};
const NON_DECOMPOSABLE_RE = /[øØæÆßłŁđĐœŒ]/g;
const APOSTROPHES_RE = /[’'`´‘]/g;
const SEPARATORS_RE = /[-‐‑–—_.·,]/g;

/**
 * SPEC 7.1: NFKD + strip combining marks, map non-decomposables, lowercase, drop apostrophes, turn
 * hyphens/underscores/periods/middle dots into spaces, collapse whitespace, drop suffix tokens anywhere
 * and title tokens at the front. "Dr. O'Halloran-Reyes Jr" → "ohalloran reyes".
 */
export function normalizeName(input: string): string {
  const stripped = input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(NON_DECOMPOSABLE_RE, (ch) => NON_DECOMPOSABLE[ch] ?? ch)
    .toLowerCase()
    .replace(APOSTROPHES_RE, '')
    .replace(SEPARATORS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped === '') return '';
  const tokens = stripped.split(' ').filter((t) => !SUFFIXES.has(t));
  while (tokens.length > 0 && TITLES.has(tokens[0])) tokens.shift();
  return tokens.join(' ');
}

/** normalizeName, then keep only [a-z0-9 ] and join with "-": "Adaeze Okonkwo" → "adaeze-okonkwo". */
export function slugify(input: string): string {
  return normalizeName(input)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-');
}

/** Reviewed professors: slugify(firstName + ' ' + lastName) (SPEC 5.1). */
export function reviewedSlug(firstName: string, lastName: string): string {
  return slugify(`${firstName} ${lastName}`);
}

/** Grades-only entities: slugify(lastCompact + ' ' + (firstToken || 'x')) → "okonkwo-j" | "patel-x" (SPEC 5.1). */
export function gradesOnlySlug(lastCompact: string, firstToken: string): string {
  return slugify(`${lastCompact} ${firstToken || 'x'}`);
}

/** Appends -2, -3, … until the slug is not in `taken`. Does not mutate `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG_RE.test(value);
}
