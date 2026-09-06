import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface FormulaBlockProps {
  /** Short heading, e.g. "Bayesian shrinkage (8.4)". */
  title: string;
  /** The formula lines, rendered verbatim in monospace (SPEC 3.6: "rendered exactly as Section 8"). */
  formula: string;
  /** Optional plain-English explanation and/or a worked example. */
  children?: ReactNode;
  /** Constants referenced by the formula, printed as name = value chips. */
  constants?: readonly { name: string; value: string | number }[];
  className?: string;
}

/**
 * A formula from SPEC Section 8 with its constants and a worked example. The `<pre>` scrolls
 * horizontally inside its own box so the page never scrolls sideways on phones.
 */
export function FormulaBlock({ title, formula, children, constants, className }: FormulaBlockProps) {
  return (
    <figure className={clsx('rounded-lg border border-border bg-surface-raised', className)}>
      <figcaption className="border-b border-border px-4 py-2 text-sm font-semibold text-ink">{title}</figcaption>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[0.8rem] leading-6 text-ink" tabIndex={0}>
        <code>{formula.trim()}</code>
      </pre>
      {constants && constants.length > 0 ? (
        <dl className="flex flex-wrap gap-2 border-t border-border px-4 py-2">
          {constants.map((c) => (
            <div
              key={c.name}
              className="inline-flex items-center gap-1 rounded bg-surface-sunken px-2 py-0.5 font-mono text-xs text-ink"
            >
              <dt>{c.name}</dt>
              <dd className="text-ink-muted">= {String(c.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="border-t border-border px-4 py-3 text-sm leading-6 text-ink-muted">{children}</div> : null}
    </figure>
  );
}

export default FormulaBlock;
