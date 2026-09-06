import Link from "next/link";
import { Fragment } from "react";
import clsx from "clsx";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the current page (rendered as text with `aria-current="page"`). */
  href?: string;
}

export interface BreadcrumbProps {
  items: readonly BreadcrumbItem[];
  className?: string;
}

/**
 * "UIUC / CS" style trail. Wrapped in `<nav aria-label="Breadcrumb">` with an
 * ordered list; separators are decorative.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={clsx("text-sm text-ink-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li className="inline-flex items-center">
                {item.href && !last ? (
                  <Link href={item.href} className="rounded hover:text-ink hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "text-ink" : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
              {!last ? (
                <li aria-hidden="true" className="select-none text-ink-faint">
                  /
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumb;
