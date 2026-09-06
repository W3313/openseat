import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/config/env";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Toaster } from "@/components/ui/Toast";
import { ShortlistProvider } from "@/components/shortlist/ShortlistProvider";
import { ShortlistDrawer } from "@/components/shortlist/ShortlistDrawer";
import { getRepository } from "@/lib/repo";
import type { DataMode, Meta, School, SchoolId } from "@/lib/domain/types";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Only school shipped in this build; the header/footer describe its dataset. */
const DEFAULT_SCHOOL: SchoolId = "uiuc";

const SITE_URL = siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ProfPeek — Find the professor, not just the course",
    template: "%s",
  },
  description:
    "Official grade curves + student reviews, filtered to sections you can still get into this term.",
  applicationName: "ProfPeek",
  openGraph: { siteName: "ProfPeek", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1117" },
  ],
};

interface ChromeData {
  mode: DataMode;
  shortName: string;
  timezone: string;
  builtAt: string | null;
  counts: Meta["counts"] | null;
  seed: number | null;
  reviewsLabel?: string;
}

/** Demo defaults used when the repository is missing or throws — the layout never crashes. */
const FALLBACK_CHROME: ChromeData = {
  mode: "demo",
  shortName: "UIUC",
  timezone: "America/Chicago",
  builtAt: null,
  counts: null,
  seed: null,
};

async function loadChrome(): Promise<ChromeData> {
  try {
    const repo = getRepository();
    const [meta, school]: [Meta, School | null] = await Promise.all([
      repo.getMeta(DEFAULT_SCHOOL),
      repo.getSchool(DEFAULT_SCHOOL),
    ]);
    const reviewsSource = meta.sources.find((s) => /review/i.test(s.id) || /review/i.test(s.label));
    return {
      mode: meta.mode,
      shortName: school?.shortName ?? FALLBACK_CHROME.shortName,
      timezone: school?.timezone ?? FALLBACK_CHROME.timezone,
      builtAt: meta.builtAt,
      counts: meta.counts,
      seed: meta.seed,
      reviewsLabel: meta.mode === "live" ? reviewsSource?.label : undefined,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[profpeek] layout: repository unavailable, using demo defaults —", (err as Error).message);
    }
    return FALLBACK_CHROME;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const chrome = await loadChrome();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-surface text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-ink"
        >
          Skip to content
        </a>
        <ShortlistProvider>
          <SiteHeader mode={chrome.mode} shortName={chrome.shortName} />
          <main id="main" className="flex w-full flex-1 flex-col">
            {children}
          </main>
          <SiteFooter
            mode={chrome.mode}
            builtAt={chrome.builtAt}
            timezone={chrome.timezone}
            counts={chrome.counts}
            seed={chrome.seed}
            reviewsLabel={chrome.reviewsLabel}
          />
          <Toaster />
          <ShortlistDrawer />
        </ShortlistProvider>
      </body>
    </html>
  );
}
