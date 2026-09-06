import clsx from "clsx";
import type { Section } from "@/lib/domain/types";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { formatMeeting, formatRoom, formatStampShort, tzAbbrev } from "@/lib/utils/format";
import { courseLabelFromId } from "@/lib/utils/ids";
import { STATUS_ORDER, StatusChip } from "./StatusChip";

export interface OpenSectionsTableProps {
  sections: readonly Section[];
  timezone: string;
  /** false in live mode → caption explains that seats are not exposed. */
  seatStatusAvailable?: boolean;
  /** The professor whose card this is; excluded from the "co-taught with" caption. */
  professorId?: string;
  /** professorId → displayName, for the co-taught caption. Falls back to raw instructor strings. */
  professorNames?: Readonly<Record<string, string>>;
  /** Detail page passes all sections (all statuses). Default caption text adapts. */
  title?: string;
  className?: string;
}

/** Open/offered first, then by course label, then section code (pure). */
export function sortSections(sections: readonly Section[]): Section[] {
  return [...sections].sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    const c = a.courseId.localeCompare(b.courseId);
    if (c !== 0) return c;
    return a.sectionCode.localeCompare(b.sectionCode);
  });
}

/** Names of the other instructors on a co-taught section (pure). */
export function coTaughtNames(section: Section, professorId?: string, names?: Readonly<Record<string, string>>): string[] {
  const others = section.professorIds.filter((id) => id !== professorId);
  if (others.length === 0) return [];
  return others.map((id) => names?.[id] ?? section.instructorsRaw.find((raw) => !names || !Object.values(names).includes(raw)) ?? id);
}

/**
 * Per-professor section table (SPEC F3): Course, CRN, Section, Type,
 * Days/Time (CT), Room, Status. Open/offered rows first; a freshness stamp and
 * the live-mode seat caveat sit in the caption.
 */
export function OpenSectionsTable({
  sections,
  timezone,
  seatStatusAvailable = true,
  professorId,
  professorNames,
  title = "Sections this term",
  className,
}: OpenSectionsTableProps) {
  const rows = sortSections(sections);
  const fetchedAt = rows[0]?.fetchedAt;
  return (
    <div className={clsx("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
        <caption className="mb-1.5 text-left text-xs text-ink-muted">
          <span className="font-medium text-ink">{title}</span>
          {fetchedAt ? <span> · as of {formatStampShort(fetchedAt, timezone)}</span> : null}
          {!seatStatusAvailable ? <span> · {TOOLTIPS.stats.offeredSections.text}</span> : null}
        </caption>
        <thead>
          <tr className="border-b border-border text-[0.7rem] uppercase tracking-wide text-ink-faint">
            <th scope="col" className="py-1 pr-3 font-medium">Course</th>
            <th scope="col" className="py-1 pr-3 font-medium">CRN</th>
            <th scope="col" className="py-1 pr-3 font-medium">Section</th>
            <th scope="col" className="py-1 pr-3 font-medium">Type</th>
            <th scope="col" className="py-1 pr-3 font-medium">Days/Time ({tzAbbrev(timezone)})</th>
            <th scope="col" className="py-1 pr-3 font-medium">Room</th>
            <th scope="col" className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-2 text-ink-muted">
                No sections this term.
              </td>
            </tr>
          ) : (
            rows.map((s) => {
              const others = coTaughtNames(s, professorId, professorNames);
              const meetings = s.meetings.length ? s.meetings : [{ days: [], start: null, end: null, building: null, room: null, type: s.type }];
              return (
                <tr key={s.id} className="border-b border-border/60 align-top last:border-0">
                  <th scope="row" className="py-1.5 pr-3 font-medium text-ink">
                    {courseLabelFromId(s.courseId)}
                    {s.crossListedCourseIds.length ? (
                      <span className="block text-[0.7rem] font-normal text-ink-faint">
                        also {s.crossListedCourseIds.map(courseLabelFromId).join(", ")}
                      </span>
                    ) : null}
                    {others.length ? (
                      <span className="block text-[0.7rem] font-normal text-ink-muted">co-taught with {others.join(", ")}</span>
                    ) : null}
                  </th>
                  <td className="py-1.5 pr-3 font-mono tabular-nums text-ink">{s.crn}</td>
                  <td className="py-1.5 pr-3 text-ink">{s.sectionCode}</td>
                  <td className="py-1.5 pr-3 text-ink-muted">{s.type}</td>
                  <td className="py-1.5 pr-3 text-ink">
                    {meetings.map((m, i) => (
                      <span key={i} className="block whitespace-nowrap">
                        {formatMeeting(m, timezone)}
                      </span>
                    ))}
                  </td>
                  <td className="py-1.5 pr-3 text-ink-muted">
                    {meetings.map((m, i) => (
                      <span key={i} className="block whitespace-nowrap">
                        {formatRoom(m)}
                      </span>
                    ))}
                  </td>
                  <td className="py-1.5">
                    <StatusChip status={s.status} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default OpenSectionsTable;
