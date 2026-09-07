// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { Combobox } from "@/components/ui/Combobox";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Toggle";
import { Toaster, clearToasts, toast } from "@/components/ui/Toast";
import { DataBadge, dataBadgeText } from "@/components/layout/DataBadge";
import { DataProvenance, formatCounts, formatStamp, reviewsClause } from "@/components/layout/DataProvenance";
import { pickBySchool, schoolFromPathname } from "@/components/layout/schoolFromPath";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

afterEach(() => {
  cleanup();
  clearToasts();
});

describe("StatTooltip", () => {
  it("opens on click, is described by the bubble, and closes on Escape", () => {
    render(<StatTooltip label="What does shrunk rating mean?" content="A small nudge toward more reviews." />);
    const button = screen.getByRole("button", { name: "What does shrunk rating mean?" });
    const bubbleId = button.getAttribute("aria-describedby");
    expect(bubbleId).toBeTruthy();
    const bubble = document.getElementById(bubbleId!)!;
    expect(bubble.getAttribute("role")).toBe("tooltip");
    expect(bubble.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(bubble.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(bubble.textContent).toBe("A small nudge toward more reviews.");

    fireEvent.keyDown(button, { key: "Escape" });
    expect(bubble.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on keyboard focus and closes on blur", () => {
    render(<StatTooltip label="Explain GPA delta" content="Leave-one-out baseline." />);
    const button = screen.getByRole("button", { name: "Explain GPA delta" });
    const bubble = document.getElementById(button.getAttribute("aria-describedby")!)!;
    fireEvent.focus(button);
    expect(bubble.hidden).toBe(false);
    fireEvent.blur(button);
    expect(bubble.hidden).toBe(true);
  });
});

interface SubjectOpt {
  code: string;
  name: string;
  professorCount: number;
}
const SUBJECTS: SubjectOpt[] = [
  { code: "CS", name: "Computer Science", professorCount: 15 },
  { code: "CHEM", name: "Chemistry", professorCount: 15 },
  { code: "MATH", name: "Mathematics", professorCount: 15 },
  { code: "STAT", name: "Statistics", professorCount: 15 },
];

function SubjectPicker({ onChange }: { onChange: (v: SubjectOpt | null) => void }) {
  const [value, setValue] = useState<SubjectOpt | null>(null);
  return (
    <Combobox<SubjectOpt>
      label="Subject"
      options={SUBJECTS}
      getKey={(o) => o.code}
      getLabel={(o) => o.code}
      getSearchText={(o) => o.name}
      renderOption={(o) => `${o.code} · ${o.name} · ${o.professorCount} professors`}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      placeholder="e.g. CS"
    />
  );
}

describe("Combobox", () => {
  it("filters as you type and selects with ArrowDown + Enter", () => {
    const onChange = vi.fn();
    render(<SubjectPicker onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Subject" });
    expect(input.getAttribute("aria-expanded")).toBe("false");

    fireEvent.change(input, { target: { value: "c" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox");
    // "c" matches CS, CHEM (code) and Mathematics / Statistics (name) — all four.
    expect(within(listbox).getAllByRole("option")).toHaveLength(4);

    fireEvent.change(input, { target: { value: "ch" } });
    let options = within(listbox).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["CHEM · Chemistry · 15 professors"]);

    // "cs" is also a substring of "Mathematics" / "Statistics"; the code-prefix
    // match must rank first so Enter picks CS.
    fireEvent.change(input, { target: { value: "cs" } });
    options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain("CS · Computer Science");

    // First match is active after typing; aria-activedescendant points at it.
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);

    // ArrowDown moves to the second option, ArrowUp back to the first.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith(SUBJECTS[0]);
    expect((input as HTMLInputElement).value).toBe("CS");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes the list without selecting; Enter then falls through to the form", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SubjectPicker onChange={onChange} />
        <button type="submit">Go</button>
      </form>,
    );
    const input = screen.getByRole("combobox", { name: "Subject" });
    fireEvent.change(input, { target: { value: "ma" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ code: "MATH" }));

    // With the list closed, Enter is not consumed by the combobox.
    fireEvent.submit(screen.getByRole("button", { name: "Go" }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows an empty message when nothing matches", () => {
    render(<SubjectPicker onChange={() => {}} />);
    const input = screen.getByRole("combobox", { name: "Subject" });
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});

describe("Segmented", () => {
  function Sort() {
    const [v, setV] = useState<"rating" | "overall" | "gpa">("rating");
    return (
      <Segmented
        label="Sort by"
        value={v}
        onChange={setV}
        options={[
          { value: "rating", label: "Rating" },
          { value: "overall", label: "Overall" },
          { value: "gpa", label: "Grades" },
        ]}
      />
    );
  }
  it("is a radiogroup with roving tabindex and arrow-key selection", () => {
    render(<Sort />);
    const group = screen.getByRole("radiogroup", { name: "Sort by" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].tabIndex).toBe(0);
    expect(radios[1].tabIndex).toBe(-1);

    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].getAttribute("aria-checked")).toBe("false");

    fireEvent.keyDown(radios[1], { key: "End" });
    expect(radios[2].getAttribute("aria-checked")).toBe("true");

    fireEvent.click(radios[0]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
  });
});

describe("Toggle", () => {
  it("is a labelled switch", () => {
    const onChange = vi.fn();
    render(<Toggle label="Open seats only" checked={true} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Open seats only" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("Toast", () => {
  it("renders in a polite live region and can be dismissed", () => {
    render(<Toaster />);
    act(() => {
      toast("Link copied", { duration: 0 });
    });
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(within(region).getByText("Link copied")).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Dismiss notification" }));
    expect(within(region).queryByText("Link copied")).toBeNull();
  });
});

describe("layout pieces", () => {
  it("formatStamp renders in the school zone with CT", () => {
    expect(formatStamp("2026-09-03T14:12:00Z", "America/Chicago")).toBe("Sep 3, 2026, 9:12 AM CT");
  });

  it("DataBadge reads 'Official grade data · <attribution>' and links to the sources table", () => {
    expect(dataBadgeText({ grades: "UIUC GPA dataset" })).toBe("Official grade data · UIUC GPA dataset");
    render(<DataBadge attribution={{ grades: "UIUC GPA dataset" }} shortName="UIUC" />);
    const link = screen.getByTestId("data-badge");
    expect(link.getAttribute("href")).toBe("/about#sources");
    expect(link.textContent).toBe("Official grade data· UIUC");
    expect(link.getAttribute("title")).toBe("Official grade data · UIUC GPA dataset");
    expect(link.getAttribute("aria-label")).toContain("UIUC GPA dataset");
  });

  it("schoolFromPathname reads the school segment of rankings, professor and compare routes", () => {
    expect(schoolFromPathname("/s/uiuc/CS?sort=gpa")).toBe("uiuc");
    expect(schoolFromPathname("/p/Purdue/abad-jason")).toBe("purdue");
    expect(schoolFromPathname("/compare/uiuc?p=a,b")).toBe("uiuc");
    expect(schoolFromPathname("/about")).toBeNull();
    expect(schoolFromPathname("/")).toBeNull();
    expect(schoolFromPathname(null)).toBeNull();
    const byId = { uiuc: "U", purdue: "P" };
    expect(pickBySchool(byId, "/s/purdue/CS", "uiuc")).toBe("P");
    expect(pickBySchool(byId, "/about", "uiuc")).toBe("U");
    expect(pickBySchool(byId, "/s/constructor/CS", "uiuc")).toBe("U");
    expect(pickBySchool(byId, "/s/nope/CS", "missing")).toBeNull();
  });

  const COUNTS = {
    professors: 92,
    reviewedProfessors: 86,
    gradesOnlyProfessors: 6,
    gradeRows: 1812,
    courses: 120,
    sections: 214,
    openSections: 118,
    reviews: 1304,
    summariesClaude: 0,
    summariesExtractive: 86,
  };

  it("DataProvenance prints the footer line for a school with a review source", () => {
    render(
      <DataProvenance
        reviewsLabel="First-party reviews"
        attribution={{ grades: "UIUC GPA dataset (MIT)", schedule: "UIUC Course Explorer" }}
        sourceUrls={{ grades: "https://github.com/wadefagen/datasets", schedule: null }}
        builtAt="2026-09-03T14:12:00Z"
        timezone="America/Chicago"
        counts={COUNTS}
      />,
    );
    const text = screen.getByTestId("data-provenance").textContent ?? "";
    expect(text).toContain("Grades: UIUC GPA dataset (MIT)");
    expect(text).toContain("Schedule: UIUC Course Explorer");
    expect(text).toContain("Reviews: First-party reviews");
    expect(text).toContain("Built Sep 3, 2026, 9:12 AM CT");
    expect(text).toContain("1,812 grade rows · 92 professors · 118 open sections · 1,304 reviews");
    expect(screen.getByRole("link", { name: "UIUC GPA dataset (MIT)" }).getAttribute("href")).toBe("https://github.com/wadefagen/datasets");
  });

  it("DataProvenance on a grades-only school says so and drops the review count", () => {
    render(
      <DataProvenance
        reviewsAvailable={false}
        attribution={{ grades: "Official grade distributions from the UIUC GPA dataset" }}
        builtAt="2026-09-03T14:12:00Z"
        timezone="America/Chicago"
        counts={COUNTS}
      />,
    );
    const text = screen.getByTestId("data-provenance").textContent ?? "";
    expect(text).toContain("Grades: Official grade distributions from the UIUC GPA dataset");
    expect(text).not.toContain("Schedule:");
    expect(text).toContain("Reviews: none (official grade data only)");
    expect(text).toContain("1,812 grade rows · 92 professors · 118 open sections");
    expect(text).not.toContain("1,304 reviews");
    expect(reviewsClause(true, "RateMyProfessors (unofficial)")).toBe("RateMyProfessors (unofficial)");
    expect(formatCounts(COUNTS, false)).not.toContain("reviews");
  });

  it("Breadcrumb marks the current page", () => {
    render(<Breadcrumb items={[{ label: "UIUC", href: "/" }, { label: "CS" }]} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "UIUC" }).getAttribute("href")).toBe("/");
    expect(within(nav).getByText("CS").getAttribute("aria-current")).toBe("page");
  });
});
