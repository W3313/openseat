import clsx from "clsx";
import type { Section } from "@/lib/domain/types";
import { termDisplay } from "@/lib/utils/term";
import { pluralize } from "@/lib/utils/format";
import { OpenSectionsTable } from "./OpenSectionsTable";

export interface SectionsTableProps {
  sections: readonly Section[];
  timezone: string;
  seatStatusAvailable?: boolean;
  professorId: string;
  /** professorId → displayName for the co-taught caption. */
  professorNames?: Readonly<Record<string, string>>;
  className?: string;
}

/** "3 sections this term · 2 open" (or "offered" in live mode). */
export function sectionsSummary(sections: readonly Section[], seatStatusAvailable = true): string {
  const open = sections.filter((s) => s.isOpen).length;
  const term = sections[0]?.term;
  const head = `${pluralize(sections.length, "section")}${term ? ` in ${termDisplay(term)}` : " this term"}`;
  if (sections.length === 0) return head;
  return `${head} · ${open} ${seatStatusAvailable ? "open" : "offered"}`;
}

/**
 * Detail-page section list (SPEC 3.4 item 5): every section this term for this professor, all
 * statuses, open/offered rows first — a thin wrapper over the shared `OpenSectionsTable`.
 */
export function SectionsTable({ sections, timezone, seatStatusAvailable = true, professorId, professorNames, className }: SectionsTableProps) {
  return (
    <section id="sections" aria-labelledby="sections-heading" className={clsx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sections-heading" className="m-0 text-base font-semibold text-ink">
          Sections this term
        </h2>
        <span className="text-xs text-ink-muted">{sectionsSummary(sections, seatStatusAvailable)}</span>
      </div>
      <div className="rounded-card border border-border bg-surface-raised p-3">
        <OpenSectionsTable
          sections={sections}
          timezone={timezone}
          seatStatusAvailable={seatStatusAvailable}
          professorId={professorId}
          professorNames={professorNames}
          title="All sections"
        />
      </div>
    </section>
  );
}

export default SectionsTable;
