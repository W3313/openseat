// UCSB instructor strings (MULTI_SCHOOL_DESIGN §4.2, §7). Both the Daily Nexus CSV and the Curriculums
// API publish instructors as upper-case "LAST F M" — surname, first initial, optional middle initial —
// truncated at 13 characters ("MARQUES-PASCU", "BUENO CACHADI"). The matcher (src/lib/matching) only
// understands the comma form "Last, F M", so every string is rewritten into it here, once, and the
// surname is title-cased so the reconstructed display name reads "C. W. Dean" rather than "C. W. DEAN".
//
// Shapes seen in the full CSV (105k rows): "DEAN C W", "BROWNING R", "VAN DER VEN A", "EL ABBADI A",
// "O'CONNOR M I", "LEE S-A" (hyphenated initials), "FOUQUE J-P", "ST. ANDREWS J", "MARQUES-PASCU"
// (truncated, no initials), "DE BRITO E SO" (truncated mid-token), "0" and "O M" (junk).

export interface UcsbInstructor {
  /** Title-cased surname (may hold several tokens): "Van Der Ven". */
  lastName: string;
  /** Upper-case initials without periods, hyphen-joined initials split: ["J", "P"]. */
  initials: string[];
  /** "Van Der Ven, A" — the comma form the matcher parses; '' for junk strings. */
  raw: string;
}

/** Separators between several instructors in one cell (not seen in the CSV; the API lists them separately). */
const MULTI_SEP_RE = /\s*(?:\/|;|\|| & | AND )\s*/i;

/** A token that is one or more single letters joined by hyphens: "J", "J-P", "S-A". */
const INITIAL_TOKEN_RE = /^[A-Z](?:-[A-Z])*$/;

/** True when the string carries no letters at all ("0", "", "-") — kept as an unattributed row. */
export function isJunkInstructor(raw: string): boolean {
  return !/[A-Za-z]/.test(raw);
}

/** "MCHUGH" → "McHugh", "O'CONNOR" → "O'Connor", "SALTZMAN-LI" → "Saltzman-Li", "DE LA CRUZ" → "De La Cruz". */
export function titleCaseSurname(upper: string): string {
  const cased = upper
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  // Mc-prefix (McHugh, McCarthy); Mac is left alone because of Macy/Mace.
  return cased.replace(/\bMc([a-z])/g, (_m, ch: string) => `Mc${ch.toUpperCase()}`);
}

/**
 * Parse one "LAST F M" string. Trailing initial-shaped tokens are the initials; everything before them
 * is the surname. A string that is only initials ("O M") keeps its first token as the surname so nothing
 * is silently dropped. Junk (no letters) yields raw ''.
 */
export function parseUcsbInstructor(input: string): UcsbInstructor {
  const cleaned = input.trim().replace(/\s+/g, ' ').toUpperCase();
  if (isJunkInstructor(cleaned)) return { lastName: '', initials: [], raw: '' };
  const tokens = cleaned.split(' ');
  let split = tokens.length;
  while (split > 1 && INITIAL_TOKEN_RE.test(tokens[split - 1])) split -= 1;
  const lastName = titleCaseSurname(tokens.slice(0, split).join(' '));
  const initials = tokens.slice(split).flatMap((t) => t.split('-'));
  const raw = initials.length > 0 ? `${lastName}, ${initials.join(' ')}` : lastName;
  return { lastName, initials, raw };
}

/** "LAST F M" → "Last, F M" (the matcher's comma form); '' for junk. */
export function toCommaForm(input: string): string {
  return parseUcsbInstructor(input).raw;
}

/** Split a cell that names several instructors ("A B / C D") and convert each; blanks and junk removed, deduped. */
export function parseUcsbInstructors(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(MULTI_SEP_RE)) {
    const raw = toCommaForm(part);
    if (raw !== '' && !out.includes(raw)) out.push(raw);
  }
  return out;
}
