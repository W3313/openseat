// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NotFoundSwitch, topSubjectsOf } from "@/components/layout/NotFoundSwitch";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

const subjectsBySchool = {
  uiuc: [
    { code: "CS", name: "Computer Science", professorCount: 120 },
    { code: "MATH", name: "Mathematics", professorCount: 90 },
  ],
  purdue: [
    { code: "MA", name: "Mathematics", professorCount: 200 },
    { code: "CS", name: "Computer Science", professorCount: 150 },
    { code: "ECE", name: "Electrical and Computer Engineering", professorCount: 60 },
  ],
};

afterEach(cleanup);

describe("NotFoundSwitch (design §8: the 404 stays in the visitor's school)", () => {
  it("links the professor 404 to the subjects of the school named in the path", () => {
    pathname = "/p/purdue/no-such-professor-zz";
    render(<NotFoundSwitch subjectsBySchool={subjectsBySchool} defaultSchoolId="uiuc" />);
    expect(screen.getByText("No professor at this address")).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/s/purdue/MA", "/s/purdue/CS", "/s/purdue/ECE"]);
    expect(screen.getByText("MA · Mathematics")).toBeInTheDocument();
  });

  it("falls back to the default school only for unknown ids", () => {
    pathname = "/p/nowhere/someone";
    render(<NotFoundSwitch subjectsBySchool={subjectsBySchool} defaultSchoolId="uiuc" />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/s/uiuc/CS", "/s/uiuc/MATH"]);
  });

  it("topSubjectsOf sorts by professor count and caps at six", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ code: `S${i}`, name: `Subject ${i}`, professorCount: i }));
    expect(topSubjectsOf(many).map((s) => s.code)).toEqual(["S8", "S7", "S6", "S5", "S4", "S3"]);
  });
});
