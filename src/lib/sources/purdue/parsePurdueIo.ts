// Pure parsers for the purdue.io OData API (MULTI_SCHOOL_DESIGN §4.2). JSON in, plain data out;
// PurdueIoSource does the fetching/caching.
//
//   GET /odata/Terms                       → [{ Code: "202710", Name: "Fall 2026", StartDate, EndDate }]
//   GET /odata/Sections?$filter=Class/Term/Code eq '202710' and Class/Course/Subject/Abbreviation eq 'CS'
//       &$expand=Class($expand=Course($expand=Subject)),Meetings($expand=Instructors,Room($expand=Building))
//       → [{ Crn, Type: "Lecture", Class: { Course: { Number: "18000", Title, Subject: { Abbreviation, Name } } },
//            Meetings: [{ Type, DaysOfWeek: "Monday, Wednesday, Friday" | "None", StartTime: "13:30:00.0000000" | null,
//                         Duration: "PT50M", Instructors: [{ Name: "First M. Last", Email }], Room: { Number, Building: { ShortCode, Name } } }] }]
// No seat counts, no status field: every listed section is "offered" (statusCode 'A'). `$top` is rejected
// by the server (limit 0), so a subject is always fetched in one page.
import type { Day, Meeting, TermCode } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import { termOrdinal } from '@/lib/utils/term';
import { termFromPurdueCode } from './terms';

export interface PurdueIoTerm { code: string; name: string; term: TermCode; startDate: string | null; endDate: string | null }

interface JsonNode { [key: string]: unknown }
const isNode = (v: unknown): v is JsonNode => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** OData envelope `{ value: [...] }` (a bare array is accepted too). */
export function odataValue(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (isNode(json) && Array.isArray(json.value)) return json.value;
  if (isNode(json) && isNode(json.error)) throw new Error(`purdue.io error: ${str(json.error.message) || 'unknown'}`);
  return [];
}

/** Terms with a parsable Banner code, sorted ascending by our ordinal (the "999999 End of Time" row is dropped). */
export function parseTerms(json: unknown): PurdueIoTerm[] {
  const out: PurdueIoTerm[] = [];
  for (const t of odataValue(json)) {
    if (!isNode(t)) continue;
    const code = str(t.Code);
    const term = termFromPurdueCode(code);
    if (!term) continue;
    out.push({ code, name: str(t.Name), term, startDate: typeof t.StartDate === 'string' ? t.StartDate : null, endDate: typeof t.EndDate === 'string' ? t.EndDate : null });
  }
  return out.sort((a, b) => termOrdinal(a.term) - termOrdinal(b.term));
}

/** Requested term when purdue.io lists it, else the latest listed term before it; null when none. */
export function resolvePurdueTerm(requested: TermCode, terms: readonly PurdueIoTerm[]): PurdueIoTerm | null {
  const exact = terms.find((t) => t.term === requested);
  if (exact) return exact;
  const want = termOrdinal(requested);
  let best: PurdueIoTerm | null = null;
  for (const t of terms) if (termOrdinal(t.term) <= want && (!best || termOrdinal(t.term) > termOrdinal(best.term))) best = t;
  return best;
}

const DAY_BY_NAME: Readonly<Record<string, Day>> = {
  monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'R', friday: 'F', saturday: 'S', sunday: 'U',
};

/** "Monday, Wednesday, Friday" → ['M','W','F']; "None" | '' → []. */
export function parseDaysOfWeek(raw: string | null | undefined): Day[] {
  const out: Day[] = [];
  for (const part of (raw ?? '').split(',')) {
    const d = DAY_BY_NAME[part.trim().toLowerCase()];
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/** "13:30:00.0000000" → "13:30"; null / '' → null. */
export function parseStartTime(raw: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((raw ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** ISO-8601 duration "PT1H15M" → minutes (75); "PT0S" → 0; unparsable → null. */
export function parseDurationMinutes(raw: string | null | undefined): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec((raw ?? '').trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Math.round(Number(m[3] ?? 0) / 60);
}

/** "13:30" + 75 → "14:45" (wraps at midnight). */
export function addMinutes(clock: string, minutes: number): string {
  const [h, m] = clock.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** purdue.io meeting/section Type → the short codes the UI already knows (LEC/LAB/DIS/ONL …). */
export const MEETING_TYPE_CODES: Readonly<Record<string, string>> = Object.freeze({
  'lecture': 'LEC', 'laboratory': 'LAB', 'recitation': 'DIS', 'distance learning': 'ONL',
  'practice study observation': 'PSO', 'research': 'RES', 'individual study': 'IND', 'experiential': 'EXP',
  'seminar': 'SEM', 'studio': 'STU', 'clinic': 'CLN', 'lab': 'LAB', 'lecture/lab': 'LCD', 'travel': 'TRV',
  'presentation': 'PRS', 'clinical': 'CLN', 'field work': 'FLD', 'independent study': 'IND',
});

export function meetingTypeCode(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (t === '') return 'UNKNOWN';
  const known = MEETING_TYPE_CODES[t.toLowerCase()];
  if (known) return known;
  const initials = t.split(/[\s/-]+/).map((w) => w[0]).join('').toUpperCase();
  return initials.length >= 2 ? initials.slice(0, 4) : t.toUpperCase().slice(0, 4);
}

const PARTICLES: ReadonlySet<string> = new Set(['de', 'da', 'del', 'della', 'di', 'du', 'la', 'le', 'van', 'von', 'der', 'den', 'ter', 'bin', 'ibn', 'al', 'el', 'st', 'mac', 'mc']);

/**
 * purdue.io names are "First M. Last" while boiler-grades prints "Last, First M.". Re-order to the comma
 * form the matcher and the grade rows use ("Gustavo Rodriguez-Rivera" → "Rodriguez-Rivera, Gustavo") so a
 * hyphenated or particle surname ("Ana de la Cruz" → "de la Cruz, Ana") keeps all of its tokens; strings
 * that already contain a comma are returned trimmed.
 */
export function toCommaForm(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed === '' || trimmed.includes(',')) return trimmed;
  const tokens = trimmed.split(' ');
  if (tokens.length < 2) return trimmed;
  let splitAt = tokens.length - 1;
  while (splitAt > 1 && PARTICLES.has(tokens[splitAt - 1].toLowerCase())) splitAt -= 1;
  return `${tokens.slice(splitAt).join(' ')}, ${tokens.slice(0, splitAt).join(' ')}`;
}

/** "TBA" rooms/buildings and empty strings count as unknown. */
function placeName(v: unknown): string | null {
  const s = str(v);
  return s === '' || s.toUpperCase() === 'TBA' ? null : s;
}

export interface ParsedPurdueMeeting { meeting: Meeting; instructors: string[] }

export function parseMeeting(raw: unknown): ParsedPurdueMeeting {
  const node = isNode(raw) ? raw : {};
  const start = parseStartTime(typeof node.StartTime === 'string' ? node.StartTime : null);
  const minutes = parseDurationMinutes(typeof node.Duration === 'string' ? node.Duration : null);
  const end = start !== null && minutes !== null && minutes > 0 ? addMinutes(start, minutes) : null;
  const room = isNode(node.Room) ? node.Room : {};
  const building = isNode(room.Building) ? room.Building : {};
  const instructors: string[] = [];
  for (const i of arr(node.Instructors)) {
    const name = isNode(i) ? toCommaForm(str(i.Name)) : '';
    if (name !== '' && !instructors.includes(name)) instructors.push(name);
  }
  return {
    meeting: {
      days: parseDaysOfWeek(typeof node.DaysOfWeek === 'string' ? node.DaysOfWeek : null),
      start,
      end,
      building: placeName(building.ShortCode) ?? placeName(building.Name),
      room: placeName(room.Number),
      type: meetingTypeCode(typeof node.Type === 'string' ? node.Type : null),
    },
    instructors,
  };
}

export interface ParsedSectionsResult {
  sections: RawSection[];
  /** Subject code → name from the expanded Subject entity (feeds departments.json). */
  subjectNames: Record<string, string>;
  /** Course number → title. */
  courseTitles: Record<string, string>;
}

/** Sections JSON → RawSection[] (sorted by CRN). Sections whose Class/Course/Subject is missing are skipped. */
export function parseSectionsJson(json: unknown, expectedSubject?: string): ParsedSectionsResult {
  const sections: RawSection[] = [];
  const subjectNames: Record<string, string> = {};
  const courseTitles: Record<string, string> = {};
  for (const s of odataValue(json)) {
    if (!isNode(s)) continue;
    const cls = isNode(s.Class) ? s.Class : {};
    const course = isNode(cls.Course) ? cls.Course : {};
    const subjectNode = isNode(course.Subject) ? course.Subject : {};
    const subject = str(subjectNode.Abbreviation).toUpperCase();
    const number = str(course.Number).toUpperCase();
    const crn = str(s.Crn);
    if (subject === '' || number === '' || crn === '') continue;
    if (expectedSubject && subject !== expectedSubject.toUpperCase()) continue;
    if (str(subjectNode.Name) !== '') subjectNames[subject] = str(subjectNode.Name);
    if (str(course.Title) !== '') courseTitles[number] = str(course.Title);
    const parsedMeetings = arr(s.Meetings).map(parseMeeting);
    const instructorsRaw: string[] = [];
    for (const m of parsedMeetings) for (const name of m.instructors) if (!instructorsRaw.includes(name)) instructorsRaw.push(name);
    const sectionType = meetingTypeCode(typeof s.Type === 'string' ? s.Type : null);
    const meetings = parsedMeetings.map((m) => m.meeting);
    if (meetings.length === 0) meetings.push({ days: [], start: null, end: null, building: null, room: null, type: sectionType });
    sections.push({ crn, subject, number, sectionCode: crn, statusCode: 'A', seatsKnown: false, instructorsRaw, meetings });
  }
  sections.sort((a, b) => a.crn.localeCompare(b.crn, undefined, { numeric: true }));
  return { sections, subjectNames, courseTitles };
}
