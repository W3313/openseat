// @vitest-environment jsdom
// Grades-only mode (MULTI_SCHOOL_DESIGN §5, §4.1, §8): what every review-dependent piece does when
// `school.reviewsAvailable` is false, and the "N sections" wording for percent-only sources.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { CourseBreakdown, ProfessorDetail, RankingsPayload } from "@/lib/domain/types";
import { RankingsHeader, rankingsDescription, rankingsTitle } from "@/components/rankings/RankingsHeader";
import { effectiveQuery } from "@/components/rankings/RankedList";
import { LowDataGroup, lowDataHeading } from "@/components/rankings/LowDataGroup";
import { SortSegmented } from "@/components/rankings/SortSegmented";
import { subjectStatItems } from "@/components/rankings/SubjectStatStrip";
import { StatsGrid, statItems } from "@/components/professor/StatsGrid";
import { ProfileHeader } from "@/components/professor/ProfileHeader";
import { CourseBreakdownTable, hasSourceGpa } from "@/components/professor/CourseBreakdownTable";
import { GradeBar, gradeSegments, visibleSegments } from "@/components/charts/GradeBar";
import { SchoolsTable, datasetCell, reviewsCell, type SchoolsTableRow } from "@/components/about/SchoolsTable";
import { statsItems, sumCounts } from "@/components/landing/StatsStrip";
import { numericRowsFor } from "@/components/shortlist/compareRows";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";
import { GRADES_ONLY_BADGES, gradedCountText, sortKeysFor, visibleBadges, badgeTooltip, OPEN_NOW_LIVE_TEXT } from "@/lib/copy/tooltips";
import { SORT_KEYS } from "@/lib/utils/urlState";
import gradesOnly from "../fixtures/rankings.grades-only.fixture.json";
import reviews from "../fixtures/rankings.CS.fixture.json";
import details from "../fixtures/professors-detail.fixture.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/s/uiuc/CS",
  useSearchParams: () => new URLSearchParams(),
}));

const payload = gradesOnly as unknown as RankingsPayload;
const reviewsPayload = reviews as unknown as RankingsPayload;
const okonkwo = payload.professors.find((p) => p.professor.slug === "adaeze-okonkwo")!;
const noRows = payload.professors.find((p) => p.professor.slug === "vantongeren-p")!;
const detail = (details as unknown as Record<string, ProfessorDetail>)["adaeze-okonkwo"];

afterEach(cleanup);

describe("school flags", () => {
  it("reads the design-doc fields and derives them for older payloads", () => {
    expect(resolveSchoolFlags(payload.school)).toMatchObject({ mode: "live", reviewsAvailable: false, gradeValueKind: "counts", gradeBuckets: "plus-minus" });
    // The reviews fixture predates the flags: a review adapter id → reviews available.
    expect(resolveSchoolFlags(reviewsPayload.school, { mode: reviewsPayload.mode })).toMatchObject({ mode: "live", reviewsAvailable: true });
    expect(resolveSchoolFlags({ id: "x", sources: { grades: "x-csv", schedule: "none", reviews: "none" } })).toMatchObject({ mode: "live", reviewsAvailable: false });
    // No flags and no adapter ids at all (older callers): keep the full review UI.
    expect(resolveSchoolFlags({ id: "x" }).reviewsAvailable).toBe(true);
  });
});

describe("rankings header and title", () => {
  it("says 'ranked by grade curve' for a grades-only school", () => {
    expect(rankingsTitle(payload)).toBe("CS professors ranked by grade curve — Fall 2026 · ProfPeek");
    expect(rankingsTitle(reviewsPayload)).toBe("CS professors with open sections — Fall 2026 · ProfPeek");
    expect(rankingsDescription(payload)).toMatch(/ranked by grade curve/);
    expect(rankingsDescription(payload).length).toBeLessThanOrEqual(155);
    expect(rankingsDescription(reviewsPayload)).toMatch(/student rating/);
  });

  it("renders the 'Ranked by grade curve' pill only in grades-only mode", () => {
    const common = { subject: payload.subject, term: payload.term, seatsFetchedAt: payload.seatsFetchedAt, gradesThroughTerm: payload.gradesThroughTerm, termFallback: false };
    render(<RankingsHeader school={payload.school} mode={payload.mode} {...common} />);
    expect(screen.getByText("Ranked by grade curve")).toBeInTheDocument();
    cleanup();
    render(<RankingsHeader school={reviewsPayload.school} mode={reviewsPayload.mode} {...common} />);
    expect(screen.queryByText("Ranked by grade curve")).toBeNull();
  });
});

describe("sort, badges and query coercion", () => {
  it("offers only the Grades sort and reads any other key as gpa", () => {
    expect(sortKeysFor(false, SORT_KEYS)).toEqual(["gpa"]);
    expect(sortKeysFor(true, SORT_KEYS)).toEqual(SORT_KEYS);
    expect(effectiveQuery({ sort: "rating", openOnly: true }, false)).toEqual({ sort: "gpa", openOnly: true });
    expect(effectiveQuery({ sort: "rating", openOnly: true }, true)).toEqual({ sort: "rating", openOnly: true });
    // A single sort is no choice: the control is hidden for grades-only schools (the header pill explains the order).
    render(<SortSegmented value="rating" onChange={() => {}} reviewsAvailable={false} />);
    expect(screen.queryByRole("radiogroup", { name: "Sort by" })).toBeNull();
    cleanup();
    render(<SortSegmented value="rating" onChange={() => {}} reviewsAvailable />);
    const radios = within(screen.getByRole("radiogroup", { name: "Sort by" })).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Rating", "Overall", "Grades", "Reviews"]);
  });

  it("words the grade-badge tooltips in sections for percent-only schools (design §4.1)", () => {
    expect(badgeTooltip("easy-a")).toMatch(/50\+ students/);
    expect(badgeTooltip("easy-a", false, "percent")).not.toMatch(/students/);
    expect(badgeTooltip("easy-a", false, "percent")).toMatch(/2\+ comparable sections/);
    expect(badgeTooltip("low-withdrawal", true, "percent")).toMatch(/sections/);
    expect(badgeTooltip("open-now", false, "percent")).toBe(OPEN_NOW_LIVE_TEXT);
  });

  it("limits badges to open-now, easy-a and low-withdrawal", () => {
    expect(visibleBadges(["open-now", "tough-but-loved", "hidden-gem", "easy-a", "low-withdrawal"], false)).toEqual(["open-now", "easy-a", "low-withdrawal"]);
    expect(visibleBadges(["hidden-gem"], true)).toEqual(["hidden-gem"]);
    expect([...GRADES_ONLY_BADGES]).not.toContain("hidden-gem");
    expect(numericRowsFor(false).map((r) => r.key)).toEqual(["gpa", "delta", "wRate", "openSections"]);
  });

  it("drops the reviews item from the subject stat strip", () => {
    const totals = { ranked: 3, lowData: 1, openSections: 4, reviews: 0 };
    expect(subjectStatItems({ subjectGpaMean: 3.3, totals, seatStatusAvailable: false, reviewsAvailable: false })).toEqual(["avg GPA 3.30", "3 ranked", "4 offered sections"]);
    expect(subjectStatItems({ subjectGpaMean: 3.3, totals, seatStatusAvailable: true })).toHaveLength(4);
  });
});

describe("graded-count wording (design §4.1)", () => {
  it("says students for count sources and sections for percent-only sources", () => {
    expect(gradedCountText({ studentsGraded: 1280, gradeRows: 12 })).toBe("1,280 students graded");
    expect(gradedCountText({ studentsGraded: 1200, gradeRows: 12 }, "percent")).toBe("12 sections graded");
    expect(gradedCountText({ studentsGraded: 100, gradeRows: 1 }, "percent")).toBe("1 section graded");
  });

  it("StatsGrid drops the five review stats and swaps in 'Sections graded' for percent sources", () => {
    const full = statItems(okonkwo.scores, 6);
    expect(full.map((i) => i.key)).toContain("ratingShrunk");
    const grades = statItems(okonkwo.scores, 6, { reviewsAvailable: false });
    expect(grades.map((i) => i.key)).toEqual(["gpaMean", "gpaDelta", "wRate", "dfwRate", "studentsGraded", "gradeRows", "yearsActive"]);
    const percent = statItems({ ...okonkwo.scores, countsAreEstimates: true }, 6, { reviewsAvailable: false, gradeValueKind: "percent" });
    const sections = percent.find((i) => i.key === "sectionsGraded")!;
    expect(sections.label).toBe("Sections graded");
    expect(sections.value).toBe(String(okonkwo.scores.gradeRows));
    // §4.1: no duplicate "Grade rows" tile and no student counts in the Δ copy for percent-only sources.
    expect(percent.map((i) => i.key)).toEqual(["gpaMean", "gpaDelta", "wRate", "dfwRate", "sectionsGraded", "yearsActive"]);
    const delta = percent.find((i) => i.key === "gpaDelta")!;
    if (okonkwo.scores.gpaDelta != null) {
      expect(delta.hint).toBe("compared section by section");
      expect(delta.tooltip).not.toMatch(/students/);
    }
    render(<StatsGrid scores={okonkwo.scores} reviewsAvailable={false} />);
    expect(screen.queryByText("Rating")).toBeNull();
    expect(screen.queryByText("Reviews")).toBeNull();
    expect(screen.getByText("Students graded")).toBeInTheDocument();
  });
});

describe("low-data group", () => {
  it("becomes 'No grade data yet' with no review counts", () => {
    expect(lowDataHeading(false).label).toBe("No grade data yet");
    expect(lowDataHeading(true).note).toBe("under 3 reviews");
    render(<LowDataGroup items={[noRows]} schoolId="uiuc" seatStatusAvailable={false} reviewsAvailable={false} />);
    const group = screen.getByTestId("low-data-group");
    expect(group.textContent).toContain("No grade data yet (1)");
    expect(group.textContent).not.toContain("review");
    expect(group.textContent).toContain("New — no grade data yet");
    expect(group.textContent).toContain("offered section");
  });
});

describe("professor detail pieces", () => {
  it("ProfileHeader hides the rating and vibe tags and shows the grade-curve pill", () => {
    render(<ProfileHeader detail={{ ...detail, vibeTags: ["engaging"] }} school={payload.school} />);
    expect(screen.getByText("Ranked by grade curve")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Vibe tags" })).toBeNull();
    expect(screen.queryByText(/reviews?$/)).toBeNull();
    expect(screen.queryByText("Grade records only — no reviews linked")).toBeNull();
  });

  it("CourseBreakdownTable shows the source GPA column only when a row carries it", () => {
    const rows = okonkwo.courses as (CourseBreakdown & { sourceGpa?: number | null })[];
    expect(hasSourceGpa(rows)).toBe(true);
    render(<CourseBreakdownTable courses={rows} schoolId="uiuc" />);
    expect(screen.getByRole("columnheader", { name: /Source GPA/ })).toBeInTheDocument();
    cleanup();
    expect(hasSourceGpa(detail.courses)).toBe(false);
    render(<CourseBreakdownTable courses={detail.courses} schoolId="uiuc" gradeValueKind="percent" />);
    expect(screen.queryByRole("columnheader", { name: /Source GPA/ })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Students \(est\.\)/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Sections/ })).toBeInTheDocument();
  });
});

describe("GradeBar legend by bucket kind (design §4)", () => {
  const buckets = { aPlus: 0, a: 40, aMinus: 0, bPlus: 0, b: 30, bMinus: 0, cPlus: 0, c: 20, cMinus: 0, dPlus: 0, d: 5, dMinus: 0, f: 5, w: 0 };
  it("hides empty +/- (and W) segments for letter-only sources but never a filled one", () => {
    const segs = gradeSegments(buckets);
    expect(visibleSegments(segs, "plus-minus").map((s) => s.label)).toEqual(["A+", "A", "A−", "B", "C", "D", "F", "W"]);
    expect(visibleSegments(segs, "letter-with-w").map((s) => s.label)).toEqual(["A", "B", "C", "D", "F", "W"]);
    expect(visibleSegments(segs, "letter-only").map((s) => s.label)).toEqual(["A", "B", "C", "D", "F"]);
    expect(visibleSegments(gradeSegments({ ...buckets, w: 3 }), "letter-only").map((s) => s.label)).toContain("W");
    render(<GradeBar buckets={buckets} legend bucketKind="letter-only" />);
    expect(within(screen.getByTestId("grade-legend")).getAllByRole("listitem", { hidden: true })).toHaveLength(5);
  });
});

describe("about: per-school sources table", () => {
  const row: SchoolsTableRow = {
    id: "uiuc", name: "University of Illinois Urbana-Champaign", shortName: "UIUC", mode: "live", reviewsAvailable: false,
    seatStatusAvailable: false, gradeValueKind: "counts", gradeBuckets: "plus-minus",
    attribution: { grades: "UIUC GPA dataset (Illinois public records)", schedule: "UIUC Course Explorer" },
    adapters: { grades: "uiuc-gpa-csv", schedule: "uiuc-course-explorer", reviews: null },
    subjectCount: 25, counts: { professors: 1204, reviewedProfessors: 0, gradesOnlyProfessors: 1204, gradeRows: 6900, courses: 900, sections: 2100, openSections: 2000, reviews: 0, summariesClaude: 0, summariesExtractive: 0 },
    builtAt: "2026-09-06T00:00:00Z", licenses: [{ label: "UIUC GPA dataset", license: null, url: "https://github.com/wadefagen/datasets" }],
  };
  it("prints attribution, adapters, buckets and dataset size per school", () => {
    expect(reviewsCell(row)).toBe("none — official grade data only");
    expect(reviewsCell({ reviewsAvailable: true })).toBe("first-party reviews");
    expect(datasetCell(row)).toBe("25 subjects · 1,204 professors · 6,900 grade rows · 2,100 sections");
    expect(datasetCell({ subjectCount: null, counts: null })).toBe("all subjects · not built yet");
    render(<SchoolsTable rows={[row, { ...row, id: "fp", name: "First-Party University", shortName: "FPU", reviewsAvailable: true, seatStatusAvailable: true }]} />);
    const table = screen.getByTestId("schools-table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(bodyRows[0].textContent).toContain("UIUC GPA dataset (Illinois public records)");
    expect(bodyRows[0].textContent).toContain("uiuc-gpa-csv");
    expect(bodyRows[0].textContent).toContain("no licence declared");
    expect(bodyRows[0].textContent).toContain("no seat availability");
    expect(bodyRows[1].textContent).toContain("first-party reviews");
    expect(bodyRows[1].textContent).toContain("seat availability exposed");
  });
});

describe("landing stats across schools", () => {
  it("sums counts and drops the reviews stat when no school has reviews", () => {
    const a = { professors: 1, reviewedProfessors: 0, gradesOnlyProfessors: 1, gradeRows: 10, courses: 1, sections: 2, openSections: 1, reviews: 0, summariesClaude: 0, summariesExtractive: 0 };
    const sum = sumCounts([a, null, { ...a, gradeRows: 5, summariesOpenAiCompatible: 2 }])!;
    expect(sum.gradeRows).toBe(15);
    expect(sum.summariesOpenAiCompatible).toBe(2);
    expect(sumCounts([null])).toBeNull();
    expect(statsItems(sum, false, false).map((i) => i.label)).toEqual(["grade rows", "professors", "offered sections"]);
    expect(statsItems(sum).map((i) => i.label)).toHaveLength(4);
  });
});
