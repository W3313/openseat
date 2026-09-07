// RawSection → Section with cross-list dedupe (SPEC 6.3 step 2). Pure.
import type { Meeting, SchoolId, Section, SectionStatus, TermCode } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import { makeCourseId, makeSectionId } from '@/lib/utils/ids';

/** A raw section tagged with the term/fetch stamp of the schedule response it came from. */
export interface RawSectionWithTerm {
  raw: RawSection;
  term: TermCode;
  fetchedAt: string;
}

/**
 * Status mapping. Seat-aware sources (UH class browser): open | waitlist | closed. Course Explorer: 'A' → offered, anything
 * else → inactive (no seat data in the public API). Empty → unknown.
 */
export function mapSectionStatus(statusCode: string): SectionStatus {
  const code = statusCode.trim().toLowerCase();
  if (code === '') return 'unknown';
  if (code === 'open' || code === 'waitlist' || code === 'closed') return code;
  if (code === 'a' || code === 'active' || code === 'offered') return 'offered';
  return 'inactive';
}

export function isOpenStatus(status: SectionStatus): boolean {
  return status === 'open' || status === 'offered';
}

function meetingKey(m: Meeting): string {
  return [m.type, m.days.join(''), m.start ?? '', m.end ?? '', m.building ?? '', m.room ?? ''].join('|');
}

/** Section-status ranking used when cross-listed copies disagree: the most permissive wins. */
const STATUS_RANK: Record<SectionStatus, number> = { open: 5, offered: 4, waitlist: 3, closed: 2, inactive: 1, unknown: 0 };

/**
 * Group raw sections by (term, crn). The group's courseId is the alphabetically-first `${subject}:${number}`;
 * the rest go to crossListedCourseIds; instructors and meetings are unioned (in first-seen order).
 * Output is sorted by (term, crn) so the file is deterministic regardless of fetch order.
 */
export function dedupeCrossListed(input: readonly RawSectionWithTerm[], schoolId: SchoolId): Section[] {
  const groups = new Map<string, RawSectionWithTerm[]>();
  for (const item of input) {
    const crn = item.raw.crn.trim();
    if (crn === '') continue;
    const key = `${item.term}|${crn}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const sections: Section[] = [];
  for (const group of groups.values()) {
    const courseKeys = [...new Set(group.map((g) => `${g.raw.subject.trim().toUpperCase()}:${g.raw.number.trim().toUpperCase()}`))].sort();
    const [primaryKey, ...rest] = courseKeys;
    const [primarySubject, primaryNumber] = primaryKey.split(':');
    const primary = group.find((g) => `${g.raw.subject.trim().toUpperCase()}:${g.raw.number.trim().toUpperCase()}` === primaryKey) ?? group[0];

    const instructors: string[] = [];
    const meetings: Meeting[] = [];
    const seenMeetings = new Set<string>();
    let status: SectionStatus = 'unknown';
    let seatsKnown = false;
    let fetchedAt = '';
    for (const g of group) {
      for (const raw of g.raw.instructorsRaw) {
        const trimmed = raw.trim();
        if (trimmed !== '' && !instructors.includes(trimmed)) instructors.push(trimmed);
      }
      for (const m of g.raw.meetings) {
        const k = meetingKey(m);
        if (seenMeetings.has(k)) continue;
        seenMeetings.add(k);
        meetings.push({ ...m, days: [...m.days] });
      }
      const s = mapSectionStatus(g.raw.statusCode);
      if (STATUS_RANK[s] > STATUS_RANK[status]) status = s;
      seatsKnown = seatsKnown || g.raw.seatsKnown;
      if (g.fetchedAt > fetchedAt) fetchedAt = g.fetchedAt;
    }

    const term = primary.term;
    const crn = primary.raw.crn.trim();
    sections.push({
      id: makeSectionId(schoolId, term, crn),
      schoolId,
      term,
      courseId: makeCourseId(schoolId, primarySubject, primaryNumber),
      crossListedCourseIds: rest.map((k) => {
        const [s, n] = k.split(':');
        return makeCourseId(schoolId, s, n);
      }),
      crn,
      sectionCode: primary.raw.sectionCode.trim(),
      type: meetings[0]?.type ?? primary.raw.meetings[0]?.type ?? 'UNKNOWN',
      status,
      seatsKnown,
      isOpen: isOpenStatus(status),
      instructorsRaw: instructors,
      professorIds: [],
      meetings,
      fetchedAt,
    });
  }

  sections.sort((a, b) => (a.term === b.term ? a.crn.localeCompare(b.crn, undefined, { numeric: true }) : a.term.localeCompare(b.term)));
  return sections;
}

/** All course ids a section belongs to (canonical + cross-listed). */
export function sectionCourseIds(section: Pick<Section, 'courseId' | 'crossListedCourseIds'>): string[] {
  return [section.courseId, ...section.crossListedCourseIds];
}
