// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SchoolChromeBadge, SchoolProvenance } from "@/components/layout/SchoolChromeSwitch";
import { buildSchoolChrome, fallbackChrome, type SchoolChrome } from "@/components/layout/schoolChrome";
import type { Meta, School } from "@/lib/domain/types";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const uiuc: School = {
  id: "uiuc",
  name: "University of Illinois Urbana-Champaign",
  shortName: "UIUC",
  mode: "live",
  currentTerm: "2026-fa",
  timezone: "America/Chicago",
  seatStatusAvailable: false,
  reviewsAvailable: false,
  gradeBuckets: "plus-minus",
  gradeValueKind: "counts",
  attribution: { grades: "UIUC GPA dataset (Illinois public records)", schedule: "UIUC Course Explorer" },
  sources: { grades: "uiuc-gpa-csv", schedule: "uiuc-course-explorer", reviews: "none" },
};

const meta: Meta = {
  builtAt: "2026-09-03T14:12:00Z",
  mode: "live",
  seed: null,
  datasetHash: "x",
  currentTerm: "2026-fa",
  scheduleTerm: "2026-fa",
  termFallback: false,
  gradesThroughTerm: "2026-sp",
  seatsFetchedAt: "2026-09-03T14:00:00Z",
  counts: { professors: 10, reviewedProfessors: 0, gradesOnlyProfessors: 10, gradeRows: 100, courses: 5, sections: 12, openSections: 9, reviews: 0, summariesClaude: 0, summariesExtractive: 0 },
  sources: [
    { id: "uiuc-gpa-csv", label: "UIUC GPA dataset", url: "https://github.com/wadefagen/datasets", license: null, fetchedAt: "2026-09-03T00:00:00Z", recordCount: 100 },
    { id: "uiuc-course-explorer", label: "UIUC Course Explorer", url: "https://courses.illinois.edu/", license: null, fetchedAt: "2026-09-03T00:00:00Z", recordCount: 12 },
  ],
  edgeCases: [],
};

const chromeBySchool: Record<string, SchoolChrome> = {
  uiuc: buildSchoolChrome("uiuc", uiuc, meta),
  demo: { ...fallbackChrome("demo", "DEMO"), mode: "demo", seed: 20260903, builtAt: "2026-09-03T14:12:00Z" },
};

afterEach(cleanup);

describe("buildSchoolChrome", () => {
  it("derives flags, attribution and source links from school.json + meta.json", () => {
    const c = chromeBySchool.uiuc;
    expect(c.mode).toBe("live");
    expect(c.reviewsAvailable).toBe(false);
    expect(c.attribution.grades).toContain("UIUC GPA dataset");
    expect(c.sourceUrls).toEqual({ grades: "https://github.com/wadefagen/datasets", schedule: "https://courses.illinois.edu/" });
    expect(c.counts?.gradeRows).toBe(100);
  });

  it("falls back to registry identity when nothing is built", () => {
    const c = buildSchoolChrome("tamu", null, null, { shortName: "TAMU", timezone: "America/Chicago" });
    expect(c.shortName).toBe("TAMU");
    expect(c.counts).toBeNull();
    expect(c.mode).toBe("demo");
  });

  it("reads an older school.json (no flags) as reviews-available demo when adapters say demo", () => {
    const old = { id: "demo", shortName: "DEMO", sources: { grades: "demo-grades", schedule: "demo-schedule", reviews: "demo-reviews" } };
    const c = buildSchoolChrome("demo", old as unknown as School, null);
    expect(c.mode).toBe("demo");
    expect(c.reviewsAvailable).toBe(true);
  });
});

describe("SchoolChromeBadge / SchoolProvenance follow the pathname (design §8)", () => {
  it("shows the DataBadge on a real school's page and the ModeBadge on the demo school", () => {
    pathname = "/s/uiuc/CS";
    render(<SchoolChromeBadge chromeBySchool={chromeBySchool} defaultSchoolId="uiuc" />);
    expect(screen.getByTestId("data-badge").textContent).toContain("Official grade data");
    expect(screen.queryByText(/DEMO DATA/)).toBeNull();
    cleanup();

    pathname = "/p/demo/adaeze-okonkwo";
    render(<SchoolChromeBadge chromeBySchool={chromeBySchool} defaultSchoolId="uiuc" />);
    expect(screen.getByRole("link").textContent).toContain("DEMO DATA");
    expect(screen.queryByTestId("data-badge")).toBeNull();
  });

  it("renders the provenance of the pathname's school, defaulting on /about", () => {
    pathname = "/compare/demo?p=a,b";
    render(<SchoolProvenance chromeBySchool={chromeBySchool} defaultSchoolId="uiuc" />);
    expect(screen.getByTestId("data-provenance").textContent).toContain("Reviews: fictional demo data (seed 20260903)");
    cleanup();

    pathname = "/about";
    render(<SchoolProvenance chromeBySchool={chromeBySchool} defaultSchoolId="uiuc" />);
    const text = screen.getByTestId("data-provenance").textContent ?? "";
    expect(text).toContain("Grades: UIUC GPA dataset (Illinois public records)");
    expect(text).toContain("Reviews: none (official grade data only)");
    expect(text).toContain("100 grade rows · 10 professors · 9 offered sections"); // seatStatusAvailable false → "offered", never "open"
    expect(text).not.toContain("0 reviews");
  });
});
