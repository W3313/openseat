// Hash helpers (SPEC 5.1 ids, 6.3 datasetHash, 6.4/6.5 collision guard). Node-only (node:crypto):
// import from scripts and server code, never from "use client" files.
import { createHash } from 'node:crypto';
import type { SchoolId, TermCode } from '@/lib/domain/types';

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha1Hex(input: string | Uint8Array): string {
  return createHash('sha1').update(input).digest('hex');
}

export function shortHash(input: string | Uint8Array, length = 16, algorithm: 'sha256' | 'sha1' = 'sha256'): string {
  return (algorithm === 'sha1' ? sha1Hex(input) : sha256Hex(input)).slice(0, length);
}

/** GradeRow.id = sha1(`${schoolId}|${courseId}|${term}|${schedType}|${instructorRaw}`).slice(0, 16). */
export function gradeRowId(
  schoolId: SchoolId,
  courseId: string,
  term: TermCode,
  schedType: string,
  instructorRaw: string,
): string {
  return sha1Hex(`${schoolId}|${courseId}|${term}|${schedType}|${instructorRaw}`).slice(0, 16);
}

/**
 * Letters-only key normalization from data/config/uiuc/README.md: NFKD, strip combining marks,
 * lowercase, drop everything but a–z. "O'Brien" → "obrien", "Van Heuvelen" → "vanheuvelen".
 */
export function lettersOnlyKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/**
 * Real-instructor collision key: sha256(lastCompact + '|' + firstToken).slice(0, 12), where
 * lastCompact = lettersOnlyKey(lastName) and firstToken = lettersOnlyKey(first whitespace token of the
 * first-name part). This is exactly how data/config/uiuc/real-instructor-keys.json was generated, so
 * the seed can re-roll any fictional name whose key appears there. No real name is stored anywhere.
 */
export function instructorKey(lastName: string, firstNamePart: string): string {
  const lastCompact = lettersOnlyKey(lastName);
  const firstToken = lettersOnlyKey(firstNamePart.trim().split(/\s+/)[0] ?? '');
  return sha256Hex(`${lastCompact}|${firstToken}`).slice(0, 12);
}

/** instructorKey for a CSV-style "Last, First M" string; null when there is no comma or no last name. */
export function instructorKeyFromRaw(raw: string): string | null {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(',');
  if (comma < 0) return null;
  const last = trimmed.slice(0, comma).trim();
  if (last === '') return null;
  return instructorKey(last, trimmed.slice(comma + 1));
}

/** Meta.datasetHash: sha256 over the concatenated stable JSON of the processed files (in the given order). */
export function datasetHash(fileContents: readonly string[]): string {
  const h = createHash('sha256');
  for (const content of fileContents) h.update(content);
  return h.digest('hex');
}
