// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SchoolSelect, schoolHint, schoolOptionLabel, type SchoolOption } from "@/components/landing/SchoolSelect";

const SCHOOLS: SchoolOption[] = [
  { id: "uiuc", name: "University of Illinois Urbana-Champaign", shortName: "UIUC", professorCount: 1204, subjectCount: 25, reviewsAvailable: false },
  { id: "purdue", name: "Purdue University", shortName: "Purdue", professorCount: 1, subjectCount: 1, reviewsAvailable: false },
  { id: "demo", name: "Demo University", shortName: "DEMO", professorCount: 108, subjectCount: 6, reviewsAvailable: true, isDemo: true },
];

afterEach(cleanup);

describe("SchoolSelect (design §8)", () => {
  it("labels every registry school with name and 'N professors · M subjects'", () => {
    expect(schoolOptionLabel(SCHOOLS[0])).toBe("UIUC — University of Illinois Urbana-Champaign · 1,204 professors · 25 subjects");
    expect(schoolOptionLabel(SCHOOLS[1])).toBe("Purdue — Purdue University · 1 professor · 1 subject");
    expect(schoolOptionLabel({ id: "x", name: "X University", shortName: "X" })).toBe("X — X University");
  });

  it("explains grades-only and demo schools under the select", () => {
    expect(schoolHint(SCHOOLS[0])).toMatch(/Official grade data only/);
    expect(schoolHint(SCHOOLS[2])).toMatch(/Fictional demo/);
    expect(schoolHint({ id: "x", name: "X", shortName: "X", reviewsAvailable: true })).toBeNull();
    expect(schoolHint(undefined)).toBeNull();
  });

  it("renders a labelled native select and calls back with the chosen id", () => {
    const onChange = vi.fn();
    render(<SchoolSelect schools={SCHOOLS} value="uiuc" onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "School" }) as HTMLSelectElement;
    expect(within(select).getAllByRole("option")).toHaveLength(3);
    expect(select.value).toBe("uiuc");
    expect(select.getAttribute("aria-describedby")).toBe(screen.getByTestId("school-hint").id);
    fireEvent.change(select, { target: { value: "demo" } });
    expect(onChange).toHaveBeenCalledWith("demo");
    fireEvent.change(select, { target: { value: "nope" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
