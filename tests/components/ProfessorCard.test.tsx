// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ProfessorCard } from "@/components/rankings/ProfessorCard";
import { deltaChipText } from "@/components/professor/DeltaChip";
import type { RankedProfessor, RankingsPayload } from "@/lib/domain/types";
import fixture from "../fixtures/rankings.CS.fixture.json";

const payload = fixture as unknown as RankingsPayload;
const okonkwo = payload.professors.find((p) => p.professor.slug === "adaeze-okonkwo")!;

/** Give the fixture professor the SPEC 12.3 numbers and a full badge row. */
const item: RankedProfessor = {
  ...okonkwo,
  rank: 1,
  badges: ["open-now", "tough-but-loved", "hidden-gem", "low-withdrawal"],
  scores: { ...okonkwo.scores, ratingShrunk: 4.6, reviewCount: 23 },
};

function renderCard(extra: Partial<React.ComponentProps<typeof ProfessorCard>> = {}) {
  return render(
    <ProfessorCard
      item={item}
      schoolId="uiuc"
      subject="CS"
      timezone="America/Chicago"
      seatStatusAvailable
      sparklineRange={payload.sparklineRange}
      {...extra}
    />,
  );
}

afterEach(cleanup);

describe("ProfessorCard", () => {
  it("renders the summary row: name, rating, review count, ≤ 3 badges, GradeBar and DeltaChip", () => {
    renderCard();
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();
    expect(screen.getByText("23 reviews")).toBeInTheDocument();

    const badges = within(screen.getByRole("list", { name: "Badges" })).getAllByRole("listitem");
    expect(badges).toHaveLength(3);
    expect(badges.map((b) => within(b).getByRole("button").textContent)).toEqual(["Open now", "Tough but loved", "Hidden gem"]);

    const bar = screen.getByRole("img", { name: /^Grade distribution/ });
    expect(bar.getAttribute("aria-label")).toContain("A");
    expect(bar.getAttribute("aria-label")).toContain("Adaeze Okonkwo");

    const delta = deltaChipText(item.scores);
    expect(delta).toBe("−0.09 vs course");
    expect(screen.getByText(delta)).toBeInTheDocument();

    // The expanded panel is not in the DOM until the card is opened.
    expect(screen.queryByRole("table", { name: /sections/i })).toBeNull();
  });

  it("expands via the <summary> to show the sections table and two quotes", () => {
    renderCard();
    const details = screen.getByText("Adaeze Okonkwo").closest("details")!;
    const summary = details.querySelector("summary")!;
    fireEvent.click(summary);
    // jsdom queues the `toggle` event as a task (and may not implement <summary> activation at all):
    // make sure the element is open and deliver the toggle synchronously, as a browser would.
    if (!details.open) details.open = true;
    fireEvent(details, new Event("toggle"));

    const table = screen.getByRole("table", { name: /Open sections/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(1 + item.openSections.length);
    expect(within(table).getByText("30101")).toBeInTheDocument();
    expect(within(table).getByText("MWF 11:00–11:50 AM CT")).toBeInTheDocument();
    expect(within(table).getByText("Open")).toBeInTheDocument();

    const quotes = screen.getAllByRole("blockquote");
    expect(quotes).toHaveLength(2);
    expect(screen.getByRole("link", { name: "See all 23 reviews (0 critical)" }).getAttribute("href")).toBe("/p/uiuc/adaeze-okonkwo#reviews");
    expect(screen.getByRole("link", { name: "View profile →" }).getAttribute("href")).toBe("/p/uiuc/adaeze-okonkwo");
    expect(screen.getByTestId("summary-source").textContent).toBe("Claude · claude-opus-5");
  });

  it("course pills call back with the course number", () => {
    const onCourseSelect = vi.fn();
    renderCard({ onCourseSelect });
    fireEvent.click(screen.getByRole("button", { name: /Filter to CS 225/ }));
    expect(onCourseSelect).toHaveBeenCalledWith("225");
  });

  it("shows the no-grade-data pill when studentsGraded is 0", () => {
    renderCard({ item: { ...item, scores: { ...item.scores, studentsGraded: 0 } } });
    expect(screen.getByText("New — no grade data yet")).toBeInTheDocument();
  });
});
