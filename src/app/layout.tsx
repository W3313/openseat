import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/config/env";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { buildSchoolChrome, fallbackChrome, type SchoolChrome } from "@/components/layout/schoolChrome";
import { Toaster } from "@/components/ui/Toast";
import { ShortlistProvider } from "@/components/shortlist/ShortlistProvider";
import { ShortlistDrawer } from "@/components/shortlist/ShortlistDrawer";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS, findSchoolConfig } from "@/lib/config/schools";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ProfPeek — Find the professor, not just the course",
    template: "%s",
  },
  description:
    "Official grade curves — and student reviews where available — filtered to sections you can still get into this term.",
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

/**
 * Header badge + footer provenance for every registered school (design §8). A school whose dataset is
 * missing or unreadable gets registry-only fallback chrome — the layout never crashes.
 */
async function loadChrome(): Promise<Record<string, SchoolChrome>> {
  const out: Record<string, SchoolChrome> = {};
  const repo = getRepository();
  await Promise.all(
    SCHOOL_IDS.map(async (id) => {
      const base = findSchoolConfig(id);
      const fallback = { shortName: base?.shortName, timezone: base?.timezone };
      try {
        const [school, meta] = await Promise.all([
          repo.getSchool(id).catch(() => null),
          repo.getMeta(id).catch(() => null),
        ]);
        out[id] = buildSchoolChrome(id, school, meta, fallback);
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.warn(`[profpeek] layout: repository unavailable for ${id}, using defaults —`, (err as Error).message);
        }
        out[id] = fallbackChrome(id, fallback.shortName, fallback.timezone);
      }
    }),
  );
  return out;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const chromeBySchool = await loadChrome();

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
          <SiteHeader chromeBySchool={chromeBySchool} defaultSchoolId={DEFAULT_SCHOOL_ID} />
          <main id="main" className="flex w-full flex-1 flex-col">
            {children}
          </main>
          <SiteFooter chromeBySchool={chromeBySchool} defaultSchoolId={DEFAULT_SCHOOL_ID} />
          <Toaster />
          <ShortlistDrawer />
        </ShortlistProvider>
      </body>
    </html>
  );
}
