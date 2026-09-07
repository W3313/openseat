"use client";

import { usePathname } from "next/navigation";
import { pickBySchool, schoolFromPathname } from "./schoolFromPath";
import { useLandingSchool } from "./landingSchool";
import type { SchoolChrome } from "./schoolChrome";
import { DataBadge } from "./DataBadge";
import { DataProvenance } from "./DataProvenance";

export interface SchoolChromeSwitchProps {
  chromeBySchool: Readonly<Record<string, SchoolChrome>>;
  defaultSchoolId: string;
}

/**
 * The chrome record for the current pathname: the URL's school on `/s/…`, `/p/…`, `/compare/…`; on the landing
 * page the school chosen in the hero form (design §8: badge and provenance follow the selected school); the
 * default school on `/about` and for unknown ids.
 */
export function useSchoolChrome({ chromeBySchool, defaultSchoolId }: SchoolChromeSwitchProps): SchoolChrome | null {
  const pathname = usePathname();
  const landing = useLandingSchool();
  if (pathname === "/" && schoolFromPathname(pathname) === null && landing && Object.hasOwn(chromeBySchool, landing)) {
    return chromeBySchool[landing];
  }
  return pickBySchool(chromeBySchool, pathname, defaultSchoolId);
}

/** Header badge: `DataBadge` "Official grade data · <attribution>" for the current school (design §8). */
export function SchoolChromeBadge(props: SchoolChromeSwitchProps) {
  const chrome = useSchoolChrome(props);
  if (!chrome) return null;
  return <DataBadge attribution={chrome.attribution} shortName={chrome.shortName} />;
}

/** Footer provenance line for the current school (design §8). */
export function SchoolProvenance(props: SchoolChromeSwitchProps & { className?: string }) {
  const chrome = useSchoolChrome(props);
  if (!chrome) return null;
  return (
    <DataProvenance
      reviewsAvailable={chrome.reviewsAvailable}
      attribution={chrome.attribution}
      sourceUrls={chrome.sourceUrls}
      builtAt={chrome.builtAt}
      timezone={chrome.timezone}
      counts={chrome.counts}
      reviewsLabel={chrome.reviewsLabel}
      seatStatusAvailable={chrome.seatStatusAvailable}
      shortName={chrome.shortName}
      className={props.className}
    />
  );
}
