import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink hover:bg-brand-strong border border-transparent shadow-sm",
  secondary:
    "bg-surface-raised text-ink border border-border-strong hover:bg-surface-sunken",
  ghost: "bg-transparent text-ink hover:bg-surface-sunken border border-transparent",
  danger:
    "bg-danger-soft text-danger border border-transparent hover:brightness-95 dark:hover:brightness-110",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

/**
 * Class list for a button-shaped element. Exported so link-shaped things
 * (e.g. "View profile →") can look like buttons without nesting elements.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return clsx(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
    "transition-colors select-none",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    extra,
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon; rendered `aria-hidden`. */
  icon?: ReactNode;
  /** Trailing icon; rendered `aria-hidden`. */
  trailingIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export type ButtonAsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

export type ButtonAsLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    /** When given, renders a Next `<Link>` styled as a button. */
    href: string;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

/**
 * Accessible button. Renders a native `<button type="button">` by default, or a
 * Next `<Link>` when `href` is provided. Focus ring comes from globals.css.
 */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", icon, trailingIcon, className, children } = props;
  const classes = buttonClasses(variant, size, className);
  const content = (
    <>
      {icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
      {trailingIcon ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {trailingIcon}
        </span>
      ) : null}
    </>
  );

  if (props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variant: _v, size: _s, icon: _i, trailingIcon: _t, className: _c, children: _ch, href, ...rest } =
      props;
    return (
      <Link href={href} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, size: _s, icon: _i, trailingIcon: _t, className: _c, children: _ch, href: _h, type, ...rest } =
    props;
  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {content}
    </button>
  );
}

export default Button;
