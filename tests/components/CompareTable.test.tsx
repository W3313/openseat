// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CompareTable, BEST_CELL_CLASS } from "@/components/shortlist/CompareTable";
import type { ProfessorDetail } from "@/lib/domain/types";
import fixture from "../fixtures/professors-detail.fixture.json";

const details = fixture as unknown as Record<string, ProfessorDetail>;
const okonkwo = details["adaeze-okonkwo"];
const sorensen = details["halvard-sorensen"];

/** Fixed numbers so the "best in row" assertions do not depend on fixture drift. */
const left: ProfessorDetail = { ...okonkwo, scores: { ...okonkwo.scores, ratingShrunk: 4.6, reviewCount: 23, wRate: 0.05, difficultyMean: 3.8 } };
const right: ProfessorDetail = { ...sorensen, scores: { ...sorensen.scores, ratingShrunk: 4.1, reviewCount: 9, wRate: 0.02, difficultyMean: 2.9 } };
const school = { id: "uiuc" as const, seatStatusAvailable: true };

afterEach(cleanup);

function rowByName(name: string) {
  return screen.getByRole("row", { name: new RegExp(`^${name}`) });
}

describe("CompareTable", () => {
  it("renders one column per professor with links to their profiles", () => {
    render(<CompareTable details={[left, right]} school={school} />);
    const table = screen.getByRole("table", { name: "Professor comparison" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Stat", expect.stringContaining("Adaeze Okonkwo"), expect.stringContaining("Halvard")]);
    expect(screen.getByRole("link", { name: "Adaeze Okonkwo" })).toHaveAttribute("href", "/p/uiuc/adaeze-okonkwo");
  });

  it("highlights the best value per row: higher rating, lower difficulty and W rate", () => {
    render(<CompareTable details={[left, right]} school={school} />);
    const ratingCells = within(rowByName("Rating")).getAllByRole("cell");
    expect(ratingCells[0]).toHaveTextContent("4.6");
    expect(ratingCells[0].className).toContain(BEST_CELL_CLASS);
    expect(ratingCells[1].className).not.toContain(BEST_CELL_CLASS);

    const diffCells = within(rowByName("Difficulty")).getAllByRole("cell");
    expect(diffCells[1]).toHaveTextContent("2.9");
    expect(diffCells[1]).toHaveAttribute("data-best", "true");
    expect(diffCells[0]).not.toHaveAttribute("data-best");

    const wCells = within(rowByName("W rate")).getAllByRole("cell");
    expect(wCells[1]).toHaveAttribute("data-best", "true");
  });

  it("shows badges, vibe tags, open sections and the AI verdict rows", () => {
    render(<CompareTable details={[left, right]} school={school} />);
    expect(rowByName("Badges")).toBeInTheDocument();
    expect(rowByName("Vibe tags")).toBeInTheDocument();
    const open = within(rowByName("Open sections")).getAllByRole("cell");
    expect(open[0]).toHaveTextContent(String(left.sections.filter((s) => s.isOpen).length));
    const verdict = within(rowByName("AI verdict")).getAllByRole("cell");
    if (left.summary) expect(verdict[0]).toHaveTextContent(left.summary.verdict);
    else expect(verdict[0]).toHaveTextContent("Not enough reviews");
  });
});
