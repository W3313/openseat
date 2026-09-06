// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AISummaryPanel, NO_SUMMARY_TEXT, summarySourceLabel } from "@/components/professor/AISummaryPanel";
import type { ProfessorSummary, RankingsPayload } from "@/lib/domain/types";
import fixture from "../fixtures/rankings.CS.fixture.json";

const payload = fixture as unknown as RankingsPayload;
const claude = payload.professors.find((p) => p.summary?.source === "claude")!.summary as ProfessorSummary;
const extractive = payload.professors.find((p) => p.summary?.source === "extractive")!.summary as ProfessorSummary;

afterEach(cleanup);

describe("AISummaryPanel", () => {
  it("shows the extractive pill text", () => {
    render(<AISummaryPanel summary={extractive} variant="compact" />);
    expect(screen.getByTestId("summary-source").textContent).toBe("Extractive summary · no API key");
    expect(screen.getByText(extractive.verdict)).toBeInTheDocument();
  });

  it("shows the Claude pill with the model (and the date in the full variant)", () => {
    render(<AISummaryPanel summary={claude} variant="compact" detailHref="/p/uiuc/adaeze-okonkwo#summary" />);
    expect(screen.getByTestId("summary-source").textContent).toBe(`Claude · ${claude.model}`);
    expect(screen.getByRole("link", { name: /Read full summary/ }).getAttribute("href")).toBe("/p/uiuc/adaeze-okonkwo#summary");
    cleanup();

    render(<AISummaryPanel summary={claude} variant="full" timezone="America/Chicago" />);
    expect(screen.getByTestId("summary-source").textContent).toBe(`Claude · ${claude.model} · Sep 3, 2026`);
    expect(summarySourceLabel(claude, { timezone: "America/Chicago", withDate: true })).toBe(`Claude · ${claude.model} · Sep 3, 2026`);
    // Full variant lists strengths / watch-outs / best-for / grading note and the evidence toggle.
    expect(screen.getByText("Strengths")).toBeInTheDocument();
    expect(screen.getByText("Watch-outs")).toBeInTheDocument();
    expect(screen.getByText(claude.bestFor)).toBeInTheDocument();
    expect(screen.getByText(claude.gradingNote)).toBeInTheDocument();
    expect(screen.getByText("Why this?")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Review \d+$/ })).toHaveLength(claude.evidenceReviewIds.length);
  });

  it("renders the null-summary message", () => {
    render(<AISummaryPanel summary={null} />);
    expect(screen.getByText(NO_SUMMARY_TEXT)).toBeInTheDocument();
    expect(NO_SUMMARY_TEXT).toBe("Not enough reviews to summarize (need 3)");
  });
});
