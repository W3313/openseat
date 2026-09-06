// Name material + string perturbation helpers for the demo seed (SPEC 6.5). Pure functions: the PRNG
// decides WHICH perturbation to apply; these decide HOW a given name is written.
import { APOSTROPHE_SURNAMES, DIACRITIC_SURNAMES, HYPHENATED_SURNAMES, PARTICLE_SURNAMES } from './namesLastA';
import type { Surname, SurnameShape } from './namesLastA';
import { PLAIN_SURNAMES } from './namesLastB';
import { NICKNAMES } from './namesFirst';

export { FIRST_NAMES, NICKNAMES, NICKNAMED_FIRST_NAMES } from './namesFirst';
export type { Surname, SurnameShape } from './namesLastA';

/** All 130 surnames: 12 hyphenated, 10 diacritic, 6 particle, 4 apostrophe, 98 plain. */
export const SURNAMES: readonly Surname[] = [
  ...HYPHENATED_SURNAMES,
  ...DIACRITIC_SURNAMES,
  ...PARTICLE_SURNAMES,
  ...APOSTROPHE_SURNAMES,
  ...PLAIN_SURNAMES,
];

export function surnamesOfShape(shape: SurnameShape): readonly Surname[] {
  return SURNAMES.filter((s) => s.shape === shape);
}

/** Fictional full name as the review source would report it (separate fields). */
export interface FullName {
  readonly firstName: string;
  readonly lastName: string;
}

/** Canonical CSV/schedule string: "Last, First". */
export function rawFull(name: FullName): string {
  return `${name.lastName}, ${name.firstName}`;
}

/** Schedule-style string: "Last, F" (first initial only). Hyphenated given names keep the first letter only. */
export function rawInitial(name: FullName): string {
  return `${name.lastName}, ${name.firstName.charAt(0)}`;
}

/** "Last, Bob" when the first name has a nickname; null otherwise. */
export function rawNickname(name: FullName, nick: string | null = firstNickname(name.firstName)): string | null {
  return nick ? `${name.lastName}, ${nick}` : null;
}

/** "Last, First Jr". */
export function rawSuffix(name: FullName, suffix = 'Jr'): string {
  return `${name.lastName}, ${name.firstName} ${suffix}`;
}

/**
 * Hyphen dropped ("Okonkwo-Reyes" → "Okonkwo Reyes") or space → hyphen ("van der Berg" → "van-der-Berg").
 * Returns null when the surname has neither a hyphen nor a space.
 */
export function rawHyphenVariant(name: FullName): string | null {
  const last = name.lastName;
  if (last.includes('-')) return `${last.replace(/-/g, ' ')}, ${name.firstName}`;
  if (last.includes(' ')) return `${last.replace(/\s+/g, '-')}, ${name.firstName}`;
  return null;
}

/** Diacritics stripped from the surname ("Ólafsdóttir" → "Olafsdottir"); null when nothing changes. */
export function rawStripped(name: FullName): string | null {
  const stripped = stripDiacritics(name.lastName);
  return stripped === name.lastName ? null : `${stripped}, ${name.firstName}`;
}

/** NFKD + strip combining marks + the letters NFKD leaves alone (ø æ ß ł đ œ and friends). */
export function stripDiacritics(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/ß/g, 'ss')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
    .replace(/ı/g, 'i');
}

/** First (most common) nickname for a first name, or null. */
export function firstNickname(firstName: string): string | null {
  const nicks = NICKNAMES[firstName];
  return nicks && nicks.length > 0 ? nicks[0] : null;
}

/** True when the surname can be written in a hyphen/space-swapped form. */
export function hasHyphenVariant(lastName: string): boolean {
  return lastName.includes('-') || lastName.includes(' ');
}

/** True when the surname carries diacritics the CSV might strip. */
export function hasDiacritics(lastName: string): boolean {
  return stripDiacritics(lastName) !== lastName;
}
