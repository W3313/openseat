import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type ChipTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type ChipSize = "sm" | "md";

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted border-border",
  brand: "bg-brand-soft text-brand border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
};

const SIZE_CLASSES: Record<ChipSize, string> = {
  sm: "h-5 px-1.5 text-[0.7rem] gap-1",
  md: "h-6 px-2 text-xs gap-1.5",
};

export function chipClasses(
  tone: ChipTone = "neutral",
  size: ChipSize = "md",
  opts?: { interactive?: boolean; selected?: boolean; className?: string },
): string {
  return clsx(
    "inline-flex shrink-0 items-center rounded-chip border font-medium leading-none whitespace-nowrap",
    TONE_CLASSES[tone],
    SIZE_CLASSES[size],
    opts?.interactive && "cursor-pointer transition-colors hover:border-border-strong",
    opts?.selected && "ring-2 ring-brand ring-offset-1 ring-offset-surface",
    opts?.className,
  );
}

interface ChipCommon {
  tone?: ChipTone;
  size?: ChipSize;
  /** Leading icon or glyph, rendered `aria-hidden`. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Native tooltip text; prefer a `StatTooltip` next to the chip for anything important. */
  title?: string;
}

export interface ChipStaticProps extends ChipCommon {
  href?: undefined;
  onClick?: undefined;
}

export interface ChipLinkProps extends ChipCommon {
  href: string;
  onClick?: undefined;
  "aria-current"?: "page" | "true" | undefined;
}

export interface ChipButtonProps
  extends ChipCommon,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "title" | "onClick"> {
  href?: undefined;
  onClick: () => void;
  /** Toggle state for filter chips (renders `aria-pressed`). */
  selected?: boolean;
}

export type ChipProps = ChipStaticProps | ChipLinkProps | ChipButtonProps;

/**
 * Small label pill. Static by default; a Next `<Link>` when `href` is given;
 * a toggle `<button aria-pressed>` when `onClick` is given (filter chips).
 */
export function Chip(props: ChipProps) {
  const { tone = "neutral", size = "md", icon, className, children, title } = props;
  const inner = (
    <>
      {icon ? (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        title={title}
        aria-current={props["aria-current"]}
        className={chipClasses(tone, size, { interactive: true, className })}
      >
        {inner}
      </Link>
    );
  }

  if (props.onClick !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tone: _t, size: _s, icon: _i, className: _c, children: _ch, title: _ti, href: _h, onClick, selected, ...rest } =
      props;
    return (
      <button
        type="button"
        title={title}
        aria-pressed={selected}
        onClick={onClick}
        className={chipClasses(tone, size, { interactive: true, selected, className })}
        {...rest}
      >
        {inner}
      </button>
    );
  }

  return (
    <span title={title} className={chipClasses(tone, size, { className })}>
      {inner}
    </span>
  );
}

export default Chip;
