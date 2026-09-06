"use client";

import { Share2 } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export interface ShareButtonProps {
  /** URL to copy; defaults to `window.location.href` at click time (keeps sort/open/course/picks). */
  url?: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** Clipboard write with a textarea fallback for browsers without `navigator.clipboard`. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies the current shareable URL and confirms with a toast (SPEC F17). Uses
 * the Web Share API on devices that have it, else the clipboard.
 */
export function ShareButton({ url, label = "Share", variant = "secondary", size = "sm", className }: ShareButtonProps) {
  const { toast } = useToast();

  async function onClick() {
    const href = url ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!href) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && /Mobi|Android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ url: href, title: document.title });
        return;
      } catch {
        /* user dismissed or unsupported — fall back to copy */
      }
    }
    const ok = await copyToClipboard(href);
    toast(ok ? "Link copied" : "Could not copy the link", { tone: ok ? "success" : "danger" });
  }

  return (
    <Button variant={variant} size={size} className={className} icon={<Share2 className="h-3.5 w-3.5" />} onClick={onClick} aria-label="Copy a link to this view">
      {label}
    </Button>
  );
}

export default ShareButton;
