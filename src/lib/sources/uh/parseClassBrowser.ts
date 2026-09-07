// Pure parsers for the UH Class Browser JSON API (https://classbrowser.uh.edu/api — no auth). Verified
// 2026-09-06:
//   GET  /api/terms            → [{ term: "2300", term_descr: "Fall 2026" }, …] (1963 → 2030, unsorted)
//   GET  /api/subjects         → { data: [{ subject: "COSC" }, …] }
//   POST /api/courses  body {"term":"2300","subject":"COSC","per_page":500}  (JSON; GET/no body → 411)
//        → Laravel pagination { current_page, last_page, per_page, total, next_page_url, data: [record…] }
//          `?page=N` selects a page; per_page above `total` returns everything on page 1.
// Record fields we use: class_nbr (CRN), subject, catalog_nbr, class_section, course_title, ssr_component
// (LEC/LAB/SEM/IND/PRA…), class_stat (A active, T tentative, S stop further enrollment, X cancelled),
// enrl_stat (O open, C closed, W wait list), enrl_tot/enrl_cap, instructor_name "Last,First" (nullable),
// schedule_day_time " TuTh 10:00 AM-11:30 AM" | "  -" | "  12:00 AM-12:00 AM" (arranged), class_start /
// class_end "HH:MM:SS" (00:00:00 when arranged), building_descr "SR2 130" (nullable), combined_section
// (C/S/null — cross-listed copies keep their own class_nbr, so no CRN dedupe happens across subjects).
import type { Day, Meeting, TermCode } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import { parseTermDisplay } from '@/lib/utils/term';

export interface ClassBrowserTerm { code: string; term: TermCode; text: string }

/** `/api/terms` body → parsed terms (unparseable descriptions skipped), sorted by code. */
export function parseTermsJson(body: unknown): ClassBrowserTerm[] {
  const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.data) ? body.data : [];
  const out: ClassBrowserTerm[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const code = String(item.term ?? '').trim();
    const text = String(item.term_descr ?? '').trim();
    const term = parseTermDisplay(text);
    if (code !== '' && term) out.push({ code, term, text });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** PeopleSoft code for a TermCode ("2026-fa" → "2300"), or null when the API does not list it. */
export function termCodeFor(terms: readonly ClassBrowserTerm[], term: TermCode): string | null {
  return terms.find((t) => t.term === term)?.code ?? null;
}

/** `/api/subjects` body → upper-cased subject codes. */
export function parseSubjectsJson(body: unknown): string[] {
  const list = isRecord(body) && Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
  return list.map((s) => (isRecord(s) ? String(s.subject ?? '') : String(s ?? '')).trim().toUpperCase()).filter(Boolean);
}

const DAY_TOKENS: Readonly<Record<string, Day>> = { Mo: 'M', Tu: 'T', We: 'W', Th: 'R', Fr: 'F', Sa: 'S', Su: 'U' };

/** " TuTh 10:00 AM-11:30 AM" → ['T','R']; "MoWeFr …" → ['M','W','F']; "  -" → []. */
export function parseDayTokens(dayTime: string | null | undefined): Day[] {
  const word = (dayTime ?? '').trim().split(/\s+/)[0] ?? '';
  const out: Day[] = [];
  for (const m of word.matchAll(/Mo|Tu|We|Th|Fr|Sa|Su/g)) {
    const d = DAY_TOKENS[m[0]];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** "10:00:00" → "10:00"; "00:00:00", null or malformed → null. */
export function parseClassClock(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** "SR2 130" → { building: "SR2", room: "130" }; "ONLINE" → { building: "ONLINE", room: null }; null/TBA → nulls. */
export function parseBuilding(raw: string | null | undefined): { building: string | null; room: string | null } {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (text === '' || /^tba$/i.test(text)) return { building: null, room: null };
  const at = text.lastIndexOf(' ');
  if (at < 0) return { building: text, room: null };
  return { building: text.slice(0, at), room: text.slice(at + 1) };
}

/** "Yun,Changhoon" → "Yun, Changhoon" (one space after the first comma, like the grade file); null/blank → null. */
export function normalizeInstructorName(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (text === '') return null;
  const comma = text.indexOf(',');
  if (comma < 0) return text;
  const last = text.slice(0, comma).trim();
  const first = text.slice(comma + 1).trim();
  return first === '' ? last : `${last}, ${first}`;
}

/**
 * class_stat + enrl_stat → the statusCode ingest maps (scripts/ingest/sections.ts mapSectionStatus):
 * active (A) sections carry their seat status (open | waitlist | closed); "stop further enrollment" (S)
 * is closed; tentative (T), cancelled (X) or anything else is inactive.
 */
export function statusCodeFor(classStat: string | null | undefined, enrlStat: string | null | undefined): string {
  const cs = (classStat ?? '').trim().toUpperCase();
  const es = (enrlStat ?? '').trim().toUpperCase();
  if (cs === 'S') return 'closed';
  if (cs !== 'A') return 'inactive';
  if (es === 'O') return 'open';
  if (es === 'W') return 'waitlist';
  if (es === 'C') return 'closed';
  return '';
}

export interface ClassBrowserPage { data: unknown[]; currentPage: number; lastPage: number; total: number }

/** One `/api/courses` response → its page fields (defensive: missing fields → a single empty page). */
export function parseCoursesPage(body: unknown): ClassBrowserPage {
  if (!isRecord(body)) return { data: [], currentPage: 1, lastPage: 1, total: 0 };
  const data = Array.isArray(body.data) ? body.data : [];
  return {
    data,
    currentPage: toInt(body.current_page, 1),
    lastPage: toInt(body.last_page, 1),
    total: toInt(body.total, data.length),
  };
}

/** One course record → RawSection; null when it has no class number. */
export function parseClassRecord(record: unknown, ctx: { subject: string }): RawSection | null {
  if (!isRecord(record)) return null;
  const crn = String(record.class_nbr ?? '').trim();
  if (crn === '') return null;
  const subject = String(record.subject ?? ctx.subject).trim().toUpperCase() || ctx.subject.toUpperCase();
  const dayTime = typeof record.schedule_day_time === 'string' ? record.schedule_day_time : '';
  const days = parseDayTokens(dayTime);
  let start = parseClassClock(typeof record.class_start === 'string' ? record.class_start : null);
  let end = parseClassClock(typeof record.class_end === 'string' ? record.class_end : null);
  if (start === '00:00' && end === '00:00') {
    start = null; // arranged / online: the API prints 12:00 AM-12:00 AM
    end = null;
  }
  const { building, room } = parseBuilding(typeof record.building_descr === 'string' ? record.building_descr : null);
  const type = String(record.ssr_component ?? '').trim().toUpperCase() || 'UNKNOWN';
  const meeting: Meeting = { days, start, end, building, room, type };
  const instructor = normalizeInstructorName(typeof record.instructor_name === 'string' ? record.instructor_name : null);
  return {
    crn,
    subject,
    number: String(record.catalog_nbr ?? '').trim().toUpperCase(),
    sectionCode: String(record.class_section ?? '').trim(),
    statusCode: statusCodeFor(str(record.class_stat), str(record.enrl_stat)),
    seatsKnown: true,
    instructorsRaw: instructor ? [instructor] : [],
    meetings: [meeting],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function toInt(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
