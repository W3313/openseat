// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HeroForm, LAST_SCHOOL_KEY, rankingsHref } from "@/components/landing/HeroForm";
import { resolveSubjectText } from "@/components/landing/SubjectCombobox";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const SCHOOLS = [{ id: "uiuc" as const, name: "University of Illinois Urbana-Champaign", shortName: "UIUC" }];
const SUBJECTS = [
  { code: "CHEM", name: "Chemistry", professorCount: 4 },
  { code: "CS", name: "Computer Science", professorCount: 15 },
  { code: "ECE", name: "Electrical and Computer Engineering", professorCount: 9 },
  { code: "MATH", name: "Mathematics", professorCount: 12 },
  { code: "STAT", name: "Statistics", professorCount: 5 },
];

function setup() {
  render(<HeroForm schools={SCHOOLS} subjects={SUBJECTS} />);
  const input = screen.getByRole("combobox", { name: "Subject" }) as HTMLInputElement;
  const listbox = document.getElementById(input.getAttribute("aria-controls")!) as HTMLUListElement;
  return { input, listbox };
}

beforeEach(() => {
  push.mockReset();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(cleanup);

describe("HeroForm", () => {
  it("renders the heading, school select and Go button", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Find the professor, not just the course.");
    const select = screen.getByRole("combobox", { name: "School" }) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(within(select).getByRole("option").textContent).toBe("UIUC — University of Illinois Urbana-Champaign");
    expect(screen.getByRole("button", { name: "Show rankings" })).toBeTruthy();
  });

  it("typing `cs` filters the combobox", () => {
    const { input, listbox } = setup();
    fireEvent.change(input, { target: { value: "cs" } });
    expect(listbox.hidden).toBe(false);
    const options = within(listbox).getAllByRole("option");
    const codes = options.map((o) => o.textContent ?? "");
    expect(codes[0]).toContain("CS");
    expect(codes[0]).toContain("Computer Science");
    expect(codes[0]).toContain("15 professors");
    expect(codes.some((c) => c.includes("ECE"))).toBe(false); // "Mathematics" and "Statistics" legitimately contain "cs"
    expect(codes.some((c) => c.includes("CHEM"))).toBe(false);
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
  });

  it("Enter navigates to /s/uiuc/CS", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "cs" } });
    fireEvent.keyDown(input, { key: "Enter" }); // picks the active option (CS)
    expect(input.value).toBe("CS");
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" }); // list closed → submits
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/s/uiuc/CS");
    expect(window.localStorage.getItem(LAST_SCHOOL_KEY)).toBe("uiuc");
  });

  it("resolves typed text without an explicit pick and appends ?course=225", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "cs" } });
    const course = screen.getByLabelText(/Course number/) as HTMLInputElement;
    fireEvent.change(course, { target: { value: "225" } });
    expect(course.value).toBe("225");
    fireEvent.click(screen.getByRole("button", { name: "Show rankings" }));
    expect(push).toHaveBeenCalledWith("/s/uiuc/CS?course=225");
  });

  it("ignores an incomplete course number and strips non-digits", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "MATH" } });
    const course = screen.getByLabelText(/Course number/) as HTMLInputElement;
    fireEvent.change(course, { target: { value: "2a2" } });
    expect(course.value).toBe("22");
    fireEvent.submit(course.closest("form")!);
    expect(push).toHaveBeenCalledWith("/s/uiuc/MATH");
  });

  it("shows an error instead of navigating when no subject matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("zzz");
  });
});

describe("helpers", () => {
  it("rankingsHref", () => {
    expect(rankingsHref("uiuc", "CS")).toBe("/s/uiuc/CS");
    expect(rankingsHref("uiuc", "CS", "225")).toBe("/s/uiuc/CS?course=225");
    expect(rankingsHref("uiuc", "CS", "22")).toBe("/s/uiuc/CS");
  });
  it("resolveSubjectText", () => {
    expect(resolveSubjectText(SUBJECTS, "cs")?.code).toBe("CS");
    expect(resolveSubjectText(SUBJECTS, "ch")?.code).toBe("CHEM");
    expect(resolveSubjectText(SUBJECTS, "statistics")?.code).toBe("STAT");
    expect(resolveSubjectText(SUBJECTS, "c")).toBeNull();
    expect(resolveSubjectText(SUBJECTS, "")).toBeNull();
  });
});
