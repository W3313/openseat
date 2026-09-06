"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Bookmark, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buildCompareHref, buildProfessorHref } from "@/lib/utils/urlState";
import { MIN_COMPARE_PICKS, schoolIdFromPathname } from "./storage";
import { useShortlist } from "./useShortlist";

export interface ShortlistDrawerProps {
  /** School whose picks to show; defaults to the school in the current path, else the first pick's. */
  schoolId?: string;
  className?: string;
}

/**
 * Floating "My picks (n)" button + slide-up drawer (SPEC 3.2 item 7 / F16). Hidden while the
 * shortlist is empty. The drawer lists picks with remove buttons and a "Compare" CTA that needs 2–3.
 */
export function ShortlistDrawer({ schoolId: schoolProp, className }: ShortlistDrawerProps) {
  const shortlist = useShortlist();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const schoolId = schoolProp ?? schoolIdFromPathname(pathname) ?? shortlist.picks[0]?.schoolId ?? null;
  const picks = schoolId ? shortlist.picksFor(schoolId) : [];
  const count = picks.length;
  const canCompare = count >= MIN_COMPARE_PICKS;
  const onComparePage = pathname?.startsWith("/compare/") ?? false;

  // Close on Escape and return focus to the FAB.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // When the last pick is removed the whole widget unmounts (below), so no auto-close effect is needed.
  if (!shortlist.ready || count === 0 || !schoolId || onComparePage) return null;

  return (
    <div className={clsx("pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end px-4 pb-4 sm:px-6", className)}>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-card border border-border bg-surface-overlay p-4 shadow-card outline-none"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="m-0 text-sm font-semibold text-ink">
              My picks ({count}/{shortlist.max})
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
              aria-label="Close My picks"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-surface-sunken hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <ul aria-label="Picked professors" className="m-0 flex list-none flex-col gap-1 p-0">
            {picks.map((p) => (
              <li key={p.slug} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
                <Link href={buildProfessorHref(p.schoolId, p.slug)} className="min-w-0 flex-1 truncate text-sm font-medium text-link hover:underline">
                  {p.displayName ?? p.slug}
                  {p.subject ? <span className="ml-1 text-xs font-normal text-ink-faint">{p.subject}</span> : null}
                </Link>
                <button
                  type="button"
                  onClick={() => shortlist.remove(p.schoolId, p.slug)}
                  aria-label={`Remove ${p.displayName ?? p.slug} from My picks`}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-danger-soft hover:text-danger"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          {!shortlist.persistent ? (
            <p className="m-0 text-xs text-ink-faint">Your browser is not saving picks; share the link to keep them.</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {canCompare ? (
              <Button size="sm" href={buildCompareHref(schoolId, picks.map((p) => p.slug))}>
                Compare {count}
              </Button>
            ) : (
              <Button size="sm" disabled title={`Pick at least ${MIN_COMPARE_PICKS} professors to compare`}>
                Compare
              </Button>
            )}
            {!canCompare ? <span className="text-xs text-ink-muted">Pick {MIN_COMPARE_PICKS - count} more to compare</span> : null}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => shortlist.clear(schoolId)}>
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border border-transparent bg-brand px-4 text-sm font-semibold text-brand-ink shadow-card transition-colors hover:bg-brand-strong"
        >
          <Bookmark aria-hidden="true" className="h-4 w-4" />
          My picks ({count})
        </button>
      )}
    </div>
  );
}

export default ShortlistDrawer;
