// UCSB course identifiers (MULTI_SCHOOL_DESIGN §4.2 "ucsb"). Both upstream sources spell a course as the
// Registrar's 13-character fixed-width id  SSSSSPPPNNNUU  (subject 5 · prefix 3 · number 3 · suffix 2):
//   "CMPSC    16  "  → subject "CMPSC", number "16"
//   "PSTATW  120A"   → subject "PSTAT", prefix "W" (summer online), number "120", suffix "A"
//   "ES   1-  99"    → subject "ES",    prefix "1-", number "99"
//   "POL S     7"    → subject "POL S", number "7"
//   "ART  CS 112"    → subject "ART",   prefix "CS" (College of Creative Studies), number "112"
// The Daily Nexus CSV strips trailing blanks, so short strings are right-padded before slicing.
//
// ProfPeek subject codes must match /^[A-Z]{2,5}$/ (src/lib/api/query.ts), so the subject field is
// reduced to its letters ("POL S" → "POLS", "W&L" → "WL"); the prefix is folded into the course number
// ("W120A", "CS112", "1-99") so an online or CCS variant never collides with the base course.

/** The 5-character subject field as the Registrar spells it, keyed by ProfPeek subject code, for every subject whose spelling is not just letters. */
export const UCSB_SUBJECT_SPELLINGS: Readonly<Record<string, string>> = Object.freeze({
  ASAM: 'AS AM',
  BLST: 'BL ST',
  CHE: 'CH E',
  CHST: 'CH ST',
  CLIT: 'C LIT',
  ENVS: 'ENV S',
  MEST: 'ME ST',
  MUSA: 'MUS A',
  POLS: 'POL S',
  RGST: 'RG ST',
  WL: 'W&L',
});

export interface UcsbCourseParts {
  /** ProfPeek subject code, letters only: "CMPSC", "POLS". */
  subject: string;
  /** Registrar subject field, trimmed: "CMPSC", "POL S". */
  subjectRaw: string;
  /** "W" | "CS" | "1-" | "" — folded into `number`. */
  prefix: string;
  /** prefix + number + suffix with no spaces: "16", "W120A", "1-99", "CS112". */
  number: string;
  /** Registrar spelling with single spaces: "CMPSC 16", "PSTAT W120A", "POL S 7". */
  label: string;
}

export class UcsbCourseIdError extends Error {
  constructor(public readonly courseId: string) {
    super(`Unparsable UCSB course id ${JSON.stringify(courseId)}`);
    this.name = 'UcsbCourseIdError';
  }
}

/** ProfPeek subject code for a Registrar subject field ("POL S" → "POLS"); '' when nothing is left. */
export function subjectKey(subjectField: string): string {
  return subjectField.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Registrar spelling for a ProfPeek subject code ("POLS" → "POL S"; letters-only codes are their own spelling). */
export function subjectSpelling(subject: string): string {
  const key = subject.trim().toUpperCase();
  return UCSB_SUBJECT_SPELLINGS[key] ?? key;
}

/**
 * Split a 13-character course id (padded if shorter). Null for strings that are not a course id at all
 * (no letters in the subject field or no digits in the number field).
 */
export function parseUcsbCourseId(courseId: string): UcsbCourseParts | null {
  const padded = courseId.replace(/\s+$/, '').padEnd(13, ' ');
  if (padded.length > 13) return null;
  const subjectRaw = padded.slice(0, 5).trim().replace(/\s+/g, ' ');
  const prefix = padded.slice(5, 8).trim();
  const num = padded.slice(8, 11).trim();
  const suffix = padded.slice(11, 13).trim();
  const subject = subjectKey(subjectRaw);
  if (subject.length < 2 || !/^\d+$/.test(num)) return null;
  const number = `${prefix}${num}${suffix}`.replace(/\s+/g, '').toUpperCase();
  const label = `${subjectRaw} ${number}`;
  return { subject, subjectRaw, prefix: prefix.toUpperCase(), number, label };
}

/** Like parseUcsbCourseId but throws UcsbCourseIdError. */
export function parseUcsbCourseIdOrThrow(courseId: string): UcsbCourseParts {
  const parts = parseUcsbCourseId(courseId);
  if (!parts) throw new UcsbCourseIdError(courseId);
  return parts;
}
