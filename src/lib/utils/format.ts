// Display formatting (SPEC 3.0 "Time display", 3.2, 3.4). Pure; safe in client components.
// Meeting times are wall-clock strings in School.timezone and are NEVER converted; ISO stamps are
// rendered with Intl in that zone.
import type { Day, Meeting } from '@/lib/domain/types';

export const DAY_ORDER: readonly Day[] = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
export const DAY_LABELS: Record<Day, string> = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };

/** Hand-kept fallbacks for runtimes without ICU zone names; Intl is asked first. */
const TZ_ABBREV: Record<string, string> = {
  'America/Chicago': 'CT',
  'America/New_York': 'ET',
  'America/Indiana/Indianapolis': 'ET',
  'America/Denver': 'MT',
  'America/Phoenix': 'MT',
  'America/Los_Angeles': 'PT',
};

const tzAbbrevCache = new Map<string, string>();

/**
 * Marketing-style zone label used next to wall-clock times: America/Chicago → "CT",
 * America/Indiana/Indianapolis → "ET". Derived from Intl's short zone name ("CDT"/"CST" → "CT", "EST" → "ET",
 * "PDT" → "PT" …); zones Intl only names by offset ("GMT+2") fall back to the table, then to the IANA id.
 */
export function tzAbbrev(timezone: string): string {
  const cached = tzAbbrevCache.get(timezone);
  if (cached) return cached;
  let out = TZ_ABBREV[timezone];
  try {
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date(Date.UTC(2026, 0, 15, 12)))
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = zone ? /^([A-Z])[SD]T$/.exec(zone) : null;
    if (m) out = `${m[1]}T`;
    else if (zone && /^[A-Z]{2,5}$/.test(zone) && !out) out = zone;
  } catch {
    /* unknown zone id → table / IANA id */
  }
  out ??= timezone;
  tzAbbrevCache.set(timezone, out);
  return out;
}

/** ['W','M','F'] → "MWF" (canonical order, deduped). */
export function formatDays(days: readonly Day[]): string {
  const set = new Set(days);
  return DAY_ORDER.filter((d) => set.has(d)).join('');
}

function splitClock(hhmm: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function clockParts(hhmm: string): { text: string; period: 'AM' | 'PM' } | null {
  const parts = splitClock(hhmm);
  if (!parts) return null;
  const period: 'AM' | 'PM' = parts.hour >= 12 ? 'PM' : 'AM';
  const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return { text: `${h12}:${String(parts.minute).padStart(2, '0')}`, period };
}

/** "13:05" → "1:05 PM"; "11:00" → "11:00 AM". Unparseable input is returned unchanged. */
export function formatClock(hhmm: string): string {
  const c = clockParts(hhmm);
  return c ? `${c.text} ${c.period}` : hhmm;
}

/** "11:00","11:50" → "11:00–11:50 AM"; "11:30","12:20" → "11:30 AM–12:20 PM"; nulls → "ARRANGED". */
export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'ARRANGED';
  const s = clockParts(start);
  const e = clockParts(end);
  if (!s || !e) return `${start}–${end}`;
  return s.period === e.period ? `${s.text}–${e.text} ${s.period}` : `${s.text} ${s.period}–${e.text} ${e.period}`;
}

/** "MWF 11:00–11:50 AM CT" (SPEC 3.0). Arranged/online meetings render as "ARRANGED". */
export function formatMeeting(meeting: Pick<Meeting, 'days' | 'start' | 'end'>, timezone = 'America/Chicago'): string {
  if (meeting.days.length === 0 || !meeting.start || !meeting.end) return 'ARRANGED';
  return `${formatDays(meeting.days)} ${formatTimeRange(meeting.start, meeting.end)} ${tzAbbrev(timezone)}`;
}

/** "Harrow Hall 210" | "Harrow Hall" | "210" | "—". */
export function formatRoom(meeting: Pick<Meeting, 'building' | 'room'>): string {
  const parts = [meeting.building, meeting.room].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(' ') : '—';
}

/** ISO UTC → "Sep 3, 2026, 9:12 AM" in the school's zone (Intl medium date + short time). */
export function formatStamp(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** ISO UTC → "Sep 3, 9:12 AM CT" (TermPill style: no year, zone label appended). */
export function formatStampShort(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${text} ${tzAbbrev(timezone)}`;
}

/** ISO UTC → "Sep 3, 2026" in the school's zone. */
export function formatDate(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Review dates are plain "YYYY-MM-DD" (no zone): "2025-05-14" → "May 2025". */
export function formatMonthYear(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dateOnly);
  if (!m) return dateOnly;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : dateOnly;
}

/** "2025-05-14" → "May 14, 2025" without any zone shift. */
export function formatDateOnly(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!m) return dateOnly;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : dateOnly;
}

/** True when `iso` is older than `maxAgeHours` relative to `now` (TermPill "(snapshot)" rule). */
export function isStale(iso: string, now: Date = new Date(), maxAgeHours = 24): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > maxAgeHours * 3_600_000;
}

const INT_FORMAT = new Intl.NumberFormat('en-US');

/** 1812 → "1,812". */
export function formatNumber(n: number): string {
  return INT_FORMAT.format(n);
}

const MINUS = '−'; // U+2212, as used in SPEC 9.6

export function formatRating(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(1);
}

export function formatGpa(n: number | null | undefined): string {
  return n == null ? '—' : n.toFixed(2);
}

/** +0.31 → "+0.31"; −0.12 → "−0.12" (U+2212); 0 → "+0.00"; null → "—". */
export function formatDelta(n: number | null | undefined, dp = 2): string {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(dp);
  return `${n < 0 && Number(abs) !== 0 ? MINUS : '+'}${abs}`;
}

/** Rate 0..1 → "3.2%" (dp decimals). */
export function formatRate(rate: number | null | undefined, dp = 1): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(dp)}%`;
}

/** Percent 0..100 → "87%". */
export function formatPct(pct: number | null | undefined, dp = 0): string {
  return pct == null ? '—' : `${pct.toFixed(dp)}%`;
}

/** pluralize(1, 'review') → "1 review"; pluralize(23, 'review') → "23 reviews". */
export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`;
}
