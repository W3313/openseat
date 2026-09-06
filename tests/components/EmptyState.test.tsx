// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmptyState, emptyRankingsTitle } from "@/components/rankings/EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders the SPEC title and fires the callback from the action button", () => {
    const onAction = vi.fn();
    render(<EmptyState title={emptyRankingsTitle("CS")} actionLabel="Include closed sections" onAction={onAction} />);
    expect(screen.getByRole("heading").textContent).toBe("Nothing open in CS right now — include closed sections?");
    const button = screen.getByRole("button", { name: "Include closed sections" });
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses the live-mode wording and renders no button without an action", () => {
    render(<EmptyState title={emptyRankingsTitle("CS", false)} description="Nothing to show." />);
    expect(screen.getByRole("heading").textContent).toBe("Nothing offered in CS this term — include all sections?");
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a secondary link action", () => {
    render(<EmptyState title="Empty" secondaryHref="/s/uiuc/CS" secondaryLabel="Clear course filter" />);
    expect(screen.getByRole("link", { name: "Clear course filter" }).getAttribute("href")).toBe("/s/uiuc/CS");
  });
});
