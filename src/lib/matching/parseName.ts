// SPEC 7.2 — turn the three raw name formats into a NameKey.
//   CSV      "Last, First M"   (comma form; first part may be '' or an initial)
//   Schedule "Last, F"         (comma form; caller-trimmed, but we trim again for the leading-space bug)
//   Reviews  { firstName, lastName } (field form) or "First M Last" (no-comma form, display names / tests)
import type { NameKey } from '@/lib/domain/types';
import { INSTRUCTOR_BLOCKLIST } from '@/lib/domain/constants';
import { normalize, PARTICLES } from './normalize';

/** Build every derived field of a NameKey from already-normalized `last` and `first` strings. */
export function buildNameKey(raw: string, last: string, first: string): NameKey {
  const lastTokens = last.split(' ').filter(Boolean);
  const firstTokens = first.split(' ').filter(Boolean);
  const firstToken = firstTokens[0] ?? '';
  return {
    raw,
    last: lastTokens.join(' '),
    lastTokens,
    lastCompact: lastTokens.join(''),
    first: firstTokens.join(' '),
    firstTokens,
    firstCompact: firstTokens.join(''),
    firstToken,
    firstInitial: firstToken[0] ?? '',
    middleInitials: firstTokens.slice(1).map((t) => t[0]),
  };
}

/** True when the string is a placeholder (Staff / TBA / '' …) that must never become a professor. */
export function isBlocked(raw: string): boolean {
  return INSTRUCTOR_BLOCKLIST.has(normalize(raw));
}

/** SPEC 7.2: "Last, First M" | "First M Last" → NameKey; null when blocked (Staff/TBA/''). */
export function parseName(raw: string): NameKey | null {
  const trimmed = raw.trim();
  if (isBlocked(trimmed)) return null;

  const comma = trimmed.indexOf(',');
  if (comma >= 0) {
    const last = normalize(trimmed.slice(0, comma));
    const first = normalize(trimmed.slice(comma + 1));
    return buildNameKey(trimmed, last, first);
  }

  // No-comma form: "First M Last"; particles before the final token belong to the surname.
  const tokens = normalize(trimmed).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;
  let splitAt = tokens.length - 1;
  while (splitAt > 0 && PARTICLES.has(tokens[splitAt - 1])) splitAt--;
  // A name that is nothing but particles + one token: keep at least one token as the surname.
  const last = tokens.slice(splitAt).join(' ');
  const first = tokens.slice(0, splitAt).join(' ');
  return buildNameKey(trimmed, last, first);
}

/** SPEC 7.2 field form for review-source professors (separate first/last names). */
export function nameKeyFromFields(firstName: string, lastName: string): NameKey {
  const first = normalize(firstName);
  const last = normalize(lastName);
  const raw = `${lastName.trim()}, ${firstName.trim()}`.replace(/,\s*$/, '');
  return buildNameKey(raw, last, first);
}

/** Merge key for grades-only entities (SPEC 7.4 step 5): strings with the same (lastCompact, firstToken) are one person. */
export function gradesOnlyMergeKey(key: Pick<NameKey, 'lastCompact' | 'firstToken'>): string {
  return `${key.lastCompact}|${key.firstToken}`;
}

export interface ReconstructedName {
  firstName: string;
  lastName: string;
  /** "First Last" with original casing and diacritics; single-letter first tokens get a period: "T. Nguyen". */
  displayName: string;
}

const SUFFIX_TOKENS: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);

/**
 * SPEC 7.4 step 5: reconstruct a display name from a raw instructor string keeping the original casing and
 * diacritics. "Okonkwo, J" → "J. Okonkwo"; "Nguyen, T" → "T. Nguyen"; "Patel" → "Patel".
 */
export function displayNameFromRaw(raw: string): ReconstructedName {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(',');
  let lastName: string;
  let firstPart: string;
  if (comma >= 0) {
    lastName = trimmed.slice(0, comma).trim();
    firstPart = trimmed.slice(comma + 1).trim();
  } else {
    const parsed = parseName(trimmed);
    const words = trimmed.split(/\s+/).filter(Boolean);
    const lastCount = parsed ? Math.max(1, parsed.lastTokens.length) : 1;
    lastName = words.slice(Math.max(0, words.length - lastCount)).join(' ');
    firstPart = words.slice(0, Math.max(0, words.length - lastCount)).join(' ');
  }
  const firstTokens = firstPart
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !SUFFIX_TOKENS.has(t.replace(/\./g, '').toLowerCase()))
    .map((t) => (t.replace(/\./g, '').length === 1 ? `${t.replace(/\./g, '')}.` : t));
  const firstName = firstTokens.join(' ');
  const displayName = firstName ? `${firstName} ${lastName}`.trim() : lastName;
  return { firstName, lastName, displayName };
}
