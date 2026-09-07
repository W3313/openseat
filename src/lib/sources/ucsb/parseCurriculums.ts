// Pure converter for the UCSB Curriculums API v3 `classes/search` response (ClassModel → RawSection[]).
// Schema source: https://developer.ucsb.edu/sites/default/files/openapi/curriculums-v3_0_0.yaml —
//   ClassModel { pageNumber, pageSize, total, classes: Class[] }
//   Class { quarter "YYYYQ", courseId (13-char, see courseId.ts), title, instructionType, instructionTypeSecondary,
//           classSections: ClassSection[] }
//   ClassSection { enrollCode (5 digits = our CRN), section ("0100"; "…00" = primary), classClosed "Y"|null,
//                  courseCancelled "Y"|null, enrolledTotal, maxEnroll, timeLocations[], instructors[] }
//   ClassTimeLocation { room, building, days ("M W    "), beginTime "HH:mm", endTime }
//   ClassInstructor { instructor "LAST F M", functionCode }
// Seat semantics are not verified without a key (see UcsbCurriculumsSource); by default a section is
// 'A' (offered) unless cancelled, seatsKnown false. With `seats: true` the enrolledTotal/maxEnroll
// pair and classClosed drive open/closed and seatsKnown becomes true.
import type { Day, Meeting } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import { parseUcsbCourseId } from './courseId';
import { toCommaForm } from './instructor';

export interface CurriculumsInstructor { instructor?: string | null; functionCode?: string | null }
export interface CurriculumsTimeLocation {
  room?: string | null; building?: string | null; days?: string | null; beginTime?: string | null; endTime?: string | null;
}
export interface CurriculumsSection {
  enrollCode?: string | null; section?: string | null; classClosed?: string | null; courseCancelled?: string | null;
  enrolledTotal?: number | null; maxEnroll?: number | null;
  timeLocations?: CurriculumsTimeLocation[] | null; instructors?: CurriculumsInstructor[] | null;
}
export interface CurriculumsClass {
  quarter?: string; courseId?: string; title?: string | null;
  instructionType?: string | null; instructionTypeSecondary?: string | null;
  classSections?: CurriculumsSection[] | null;
}
export interface CurriculumsPage { pageNumber?: number; pageSize?: number; total?: number; classes?: CurriculumsClass[] | null }

export interface ParseCurriculumsOptions {
  /** Keep only classes whose parsed subject code equals this (the API filters by subjectCode, this guards the cache). */
  subject?: string;
  /** Emit open/closed + seatsKnown from enrolledTotal/maxEnroll/classClosed (default false → 'A' / cancelled). */
  seats?: boolean;
}

export interface CurriculumsCourse { subject: string; number: string; title: string; sections: RawSection[] }

const DAY_LETTERS: ReadonlySet<string> = new Set(['M', 'T', 'W', 'R', 'F', 'S', 'U']);

/** "M W    " → ['M','W']; "TR" → ['T','R']; blanks/unknown letters dropped. */
export function parseCurriculumsDays(raw: string | null | undefined): Day[] {
  const out: Day[] = [];
  for (const ch of (raw ?? '').toUpperCase()) {
    if (DAY_LETTERS.has(ch) && !out.includes(ch as Day)) out.push(ch as Day);
  }
  return out;
}

/** "9:00" | "09:00" | "14:30" → "HH:MM"; null when absent or malformed. */
export function parseCurriculumsClock(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Primary sections end in "00" (instructionType); secondaries (discussion/lab) use instructionTypeSecondary. */
export function isPrimarySection(sectionCode: string): boolean {
  return /00$/.test(sectionCode.trim());
}

export function sectionStatusCode(section: CurriculumsSection, seats: boolean): string {
  if ((section.courseCancelled ?? '').trim().toUpperCase() === 'Y') return 'cancelled';
  if (!seats) return 'A';
  if ((section.classClosed ?? '').trim().toUpperCase() === 'Y') return 'closed';
  const enrolled = section.enrolledTotal;
  const max = section.maxEnroll;
  if (typeof enrolled === 'number' && typeof max === 'number' && max > 0) return enrolled >= max ? 'closed' : 'open';
  return 'A';
}

function blank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** One class (course) → its sections as RawSection[] (empty when the course id is unparsable). */
export function parseCurriculumsClass(cls: CurriculumsClass, opts: ParseCurriculumsOptions = {}): CurriculumsCourse | null {
  const parts = parseUcsbCourseId(cls.courseId ?? '');
  if (!parts) return null;
  if (opts.subject && parts.subject !== opts.subject.toUpperCase()) return null;
  const seats = opts.seats ?? false;
  const primaryType = (cls.instructionType ?? '').trim().toUpperCase();
  const secondaryType = (cls.instructionTypeSecondary ?? '').trim().toUpperCase() || primaryType;
  const sections: RawSection[] = [];
  for (const s of cls.classSections ?? []) {
    const crn = (s.enrollCode ?? '').trim();
    if (crn === '') continue;
    const sectionCode = (s.section ?? '').trim();
    const type = isPrimarySection(sectionCode) ? primaryType : secondaryType;
    const instructorsRaw: string[] = [];
    for (const i of s.instructors ?? []) {
      const raw = toCommaForm(i.instructor ?? '');
      if (raw !== '' && !instructorsRaw.includes(raw)) instructorsRaw.push(raw);
    }
    const meetings: Meeting[] = (s.timeLocations ?? []).map((t) => ({
      days: parseCurriculumsDays(t.days),
      start: parseCurriculumsClock(t.beginTime),
      end: parseCurriculumsClock(t.endTime),
      building: blank(t.building),
      room: blank(t.room),
      type,
    }));
    if (meetings.length === 0) meetings.push({ days: [], start: null, end: null, building: null, room: null, type });
    sections.push({
      crn, subject: parts.subject, number: parts.number, sectionCode,
      statusCode: sectionStatusCode(s, seats),
      seatsKnown: seats && typeof s.enrolledTotal === 'number' && typeof s.maxEnroll === 'number',
      instructorsRaw, meetings,
    });
  }
  return { subject: parts.subject, number: parts.number, title: (cls.title ?? '').trim(), sections };
}

/** Every class of one or more pages → courses (unparsable / off-subject classes skipped). */
export function parseCurriculumsClasses(classes: readonly CurriculumsClass[], opts: ParseCurriculumsOptions = {}): CurriculumsCourse[] {
  const out: CurriculumsCourse[] = [];
  for (const cls of classes) {
    const course = parseCurriculumsClass(cls, opts);
    if (course) out.push(course);
  }
  return out;
}
