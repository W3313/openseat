// Pure parsers for the UIUC Course Explorer XML API (SPEC 6.2, SOURCE_FACTS 2 & 5). Every function takes
// XML text and returns plain data; CourseExplorerSource does the fetching/caching.
//
// fast-xml-parser gotcha: without `isArray`, a single child element parses to an OBJECT, not a
// one-element array. Every repeated element is listed in ARRAY_TAGS. Roots keep their `ns2:` prefix
// (we never rely on the root name — see rootOf()).
import { XMLParser } from 'fast-xml-parser';
import type { Day, Meeting, TermCode } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import { compareTerms, parseTermDisplay, termOrdinal } from '@/lib/utils/term';

const ARRAY_TAGS: ReadonlySet<string> = new Set([
  'detailedSection', 'meeting', 'instructor', 'course', 'term', 'subject', 'section',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,            // keep "001", "65054" etc. as strings
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type XmlNode = Record<string, unknown>;

function isNode(v: unknown): v is XmlNode {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The document root (first non-declaration key), regardless of namespace prefix. */
function rootOf(doc: unknown): XmlNode {
  if (!isNode(doc)) return {};
  for (const key of Object.keys(doc)) {
    if (key.startsWith('?')) continue;
    const v = doc[key];
    if (Array.isArray(v)) return isNode(v[0]) ? v[0] : {};
    if (isNode(v)) return v;
  }
  return {};
}

function toArray<T = unknown>(v: unknown): T[] {
  if (v === undefined || v === null || v === '') return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

/** Text of a node: plain string, or the "#text" of an element with attributes. */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (isNode(v) && typeof v['#text'] === 'string') return (v['#text'] as string).trim();
  return '';
}

function attrOf(v: unknown, name: string): string {
  return isNode(v) && typeof v[`@_${name}`] === 'string' ? (v[`@_${name}`] as string).trim() : '';
}

export function parseXml(xml: string): XmlNode {
  return rootOf(parser.parse(xml));
}

// ---------------------------------------------------------------------------------------------- terms

export interface ExplorerTerm { term: TermCode; text: string; href: string | null }

/** `{BASE}/{year}.xml` → published terms, matched on the element TEXT ("Fall 2026"), never the numeric id. */
export function parseTermsXml(xml: string): ExplorerTerm[] {
  const root = parseXml(xml);
  const terms = isNode(root.terms) ? toArray(root.terms.term) : [];
  const out: ExplorerTerm[] = [];
  for (const t of terms) {
    const text = textOf(t);
    const code = parseTermDisplay(text);
    if (code) out.push({ term: code, text, href: attrOf(t, 'href') || null });
  }
  return out.sort((a, b) => compareTerms(a.term, b.term));
}

/**
 * Requested term if published; otherwise the latest published term ≤ requested by ordinal; null when
 * nothing qualifies (caller tries the previous calendar year).
 */
export function resolveScheduleTerm(requested: TermCode, published: readonly TermCode[]): TermCode | null {
  if (published.includes(requested)) return requested;
  const want = termOrdinal(requested);
  let best: TermCode | null = null;
  for (const t of published) {
    if (termOrdinal(t) <= want && (best === null || termOrdinal(t) > termOrdinal(best))) best = t;
  }
  return best;
}

// ------------------------------------------------------------------------------------------- subjects

/** `{BASE}/{year}/{season}.xml` → subject codes ("CS", "ECE", ...). */
export function parseSubjectsXml(xml: string): string[] {
  const root = parseXml(xml);
  const subjects = isNode(root.subjects) ? toArray(root.subjects.subject) : [];
  return subjects.map((s) => attrOf(s, 'id').toUpperCase()).filter(Boolean);
}

// -------------------------------------------------------------------------------------------- courses

export interface ExplorerCourse { number: string; title: string }

/** `{BASE}/{year}/{season}/{SUBJECT}.xml` → `<course id="225">Data Structures</course>` list. */
export function parseCourseListXml(xml: string): ExplorerCourse[] {
  const root = parseXml(xml);
  const courses = isNode(root.courses) ? toArray(root.courses.course) : [];
  return courses
    .map((c) => ({ number: attrOf(c, 'id').toUpperCase(), title: textOf(c) }))
    .filter((c) => c.number !== '');
}

// ------------------------------------------------------------------------------------------- sections

const DAY_LETTERS: ReadonlySet<string> = new Set(['M', 'T', 'W', 'R', 'F', 'S', 'U']);

/** "MWF" → ['M','W','F']; unknown letters dropped; '' / ARRANGED → []. */
export function parseDays(raw: string | undefined): Day[] {
  if (!raw) return [];
  const out: Day[] = [];
  for (const ch of raw.toUpperCase()) {
    if (DAY_LETTERS.has(ch) && !out.includes(ch as Day)) out.push(ch as Day);
  }
  return out;
}

/** "11:00AM" → "11:00", "12:30PM" → "12:30", "01:45PM" → "13:45", "12:05AM" → "00:05"; else null. */
export function parseClock(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'P') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function statusFromCode(statusCode: string): 'offered' | 'inactive' {
  return statusCode.trim().toUpperCase() === 'A' ? 'offered' : 'inactive';
}

interface ParsedMeeting { meeting: Meeting; instructors: string[] }

function parseMeeting(m: unknown): ParsedMeeting {
  const node = isNode(m) ? m : {};
  const start = parseClock(textOf(node.start));
  const end = parseClock(textOf(node.end));
  const building = textOf(node.buildingName) || null;
  const room = textOf(node.roomNumber) || null;
  const type = attrOf(node.type, 'code').toUpperCase() || textOf(node.type).toUpperCase() || 'UNKNOWN';
  const instructors: string[] = [];
  if (isNode(node.instructors)) {
    for (const i of toArray(node.instructors.instructor)) {
      const name = textOf(i).trim();               // leading-space bug on 2nd+ instructors (SOURCE_FACTS 2)
      if (name !== '') instructors.push(name);
    }
  }
  return {
    meeting: { days: parseDays(textOf(node.daysOfTheWeek)), start, end, building, room, type },
    instructors,
  };
}

export interface CascadeCourse {
  number: string; title: string; description: string | null; creditHours: string | null;
  sections: RawSection[];
}

/** `{BASE}/{year}/{season}/{SUBJECT}/{number}.xml?mode=cascade` → RawSection per `<detailedSection>`. */
export function parseCourseExplorerXml(xml: string, ctx: { subject: string; number?: string }): CascadeCourse {
  const root = parseXml(xml);
  const number = (ctx.number ?? attrOf(root, 'id')).toUpperCase();
  const subject = ctx.subject.toUpperCase();
  const detailed = isNode(root.detailedSections) ? toArray(root.detailedSections.detailedSection) : [];
  const sections: RawSection[] = [];
  for (const ds of detailed) {
    if (!isNode(ds)) continue;
    const crn = attrOf(ds, 'id');
    if (crn === '') continue;
    const meetings = isNode(ds.meetings) ? toArray(ds.meetings.meeting).map(parseMeeting) : [];
    const instructorsRaw: string[] = [];
    for (const pm of meetings) for (const name of pm.instructors) if (!instructorsRaw.includes(name)) instructorsRaw.push(name);
    const statusCode = textOf(ds.sectionStatusCode) || textOf(ds.statusCode) || '';
    sections.push({
      crn,
      subject,
      number,
      sectionCode: textOf(ds.sectionNumber),
      statusCode,
      seatsKnown: false,
      instructorsRaw,
      meetings: meetings.map((pm) => pm.meeting),
    });
  }
  return {
    number,
    title: textOf(root.label),
    description: textOf(root.description) || null,
    creditHours: textOf(root.creditHours) || null,
    sections,
  };
}
