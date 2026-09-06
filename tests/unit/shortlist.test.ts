import { describe, expect, it } from "vitest";
import {
  MAX_PICKS,
  SHORTLIST_KEY,
  addPick,
  clearSchool,
  isFull,
  isPicked,
  mergeUrlPicks,
  parseStoredPicks,
  readPicks,
  removePick,
  schoolIdFromPathname,
  serializeStoredPicks,
  togglePick,
  withPicksParam,
  writePicks,
  type ShortlistPick,
  type StorageLike,
} from "@/components/shortlist/storage";
import { bestIndexes, orderBySlugs } from "@/components/shortlist/compareRows";
import type { ProfessorDetail } from "@/lib/domain/types";
import fixture from "../fixtures/professors-detail.fixture.json";

const details = fixture as unknown as Record<string, ProfessorDetail>;

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("SecurityError");
  }
  setItem(): void {
    throw new Error("QuotaExceededError");
  }
}

const a: ShortlistPick = { schoolId: "uiuc", slug: "adaeze-okonkwo", displayName: "Adaeze Okonkwo", subject: "CS" };
const b: ShortlistPick = { schoolId: "uiuc", slug: "halvard-sorensen" };
const c: ShortlistPick = { schoolId: "uiuc", slug: "rafael-ibarra-quintero" };
const d: ShortlistPick = { schoolId: "uiuc", slug: "achterberg-n" };

describe("shortlist storage", () => {
  it("uses a versioned key and round-trips through storage", () => {
    expect(SHORTLIST_KEY).toBe("profpeek:v1:picks");
    const storage = new MemoryStorage();
    expect(writePicks(storage, [a, b])).toBe(true);
    expect(JSON.parse(storage.getItem(SHORTLIST_KEY)!)).toMatchObject({ version: 1 });
    expect(readPicks(storage)).toEqual([a, b]);
  });

  it("never throws when storage is unavailable or corrupt", () => {
    expect(readPicks(null)).toEqual([]);
    expect(readPicks(new ThrowingStorage())).toEqual([]);
    expect(writePicks(new ThrowingStorage(), [a])).toBe(false);
    expect(parseStoredPicks("not json")).toEqual([]);
    expect(parseStoredPicks(JSON.stringify({ version: 1, picks: [{ slug: "BAD SLUG", schoolId: "uiuc" }, { slug: 1 }] }))).toEqual([]);
    expect(parseStoredPicks(serializeStoredPicks([a, a]))).toEqual([a]); // dedupes
  });

  it("toggles membership and caps the list at MAX_PICKS per school", () => {
    let picks: ShortlistPick[] = [];
    picks = togglePick(picks, a);
    picks = togglePick(picks, b);
    picks = togglePick(picks, c);
    expect(picks.map((p) => p.slug)).toEqual([a.slug, b.slug, c.slug]);
    expect(isFull(picks, "uiuc")).toBe(true);
    expect(MAX_PICKS).toBe(3);
    expect(togglePick(picks, d)).toEqual(picks); // full → unchanged
    picks = togglePick(picks, b); // remove
    expect(isPicked(picks, "uiuc", b.slug)).toBe(false);
    expect(isFull(picks, "uiuc")).toBe(false);
    expect(removePick(picks, "uiuc", "nope")).toEqual(picks);
    expect(clearSchool([...picks, { schoolId: "other", slug: "x" }], "uiuc")).toEqual([{ schoolId: "other", slug: "x" }]);
  });

  it("addPick upserts metadata for an existing pick without changing order", () => {
    const picks = addPick([b, a], { slug: b.slug, schoolId: "uiuc", displayName: "Halvard Sørensen", subject: "ECE" });
    expect(picks[0]).toEqual({ ...b, displayName: "Halvard Sørensen", subject: "ECE" });
    expect(picks[1]).toEqual(a);
  });

  it("merges picks from a share URL first and mirrors them back into the query string", () => {
    const merged = mergeUrlPicks([a], "?sort=gpa&picks=halvard-sorensen,adaeze-okonkwo,rafael-ibarra-quintero,achterberg-n", "uiuc");
    expect(merged.map((p) => p.slug)).toEqual([b.slug, a.slug, c.slug]); // capped at 3, stored metadata kept
    expect(merged[1]).toEqual(a);
    const params = withPicksParam("?sort=gpa&picks=old", merged, "uiuc");
    expect(params.get("sort")).toBe("gpa");
    expect(params.get("picks")).toBe(`${b.slug},${a.slug},${c.slug}`);
    expect(withPicksParam("?picks=x&open=0", [], "uiuc").toString()).toBe("open=0");
    expect(mergeUrlPicks([a], "", "uiuc")).toEqual([a]);
  });

  it("derives the school from the pathname", () => {
    expect(schoolIdFromPathname("/s/uiuc/CS")).toBe("uiuc");
    expect(schoolIdFromPathname("/p/UIUC/adaeze-okonkwo")).toBe("uiuc");
    expect(schoolIdFromPathname("/compare/uiuc")).toBe("uiuc");
    expect(schoolIdFromPathname("/about")).toBeNull();
    expect(schoolIdFromPathname(null)).toBeNull();
  });
});

describe("compare rows", () => {
  it("highlights the best value per direction, ignores nulls, and skips all-equal or single rows", () => {
    expect(bestIndexes([4.2, 4.6, null], "high")).toEqual([1]);
    expect(bestIndexes([0.05, 0.02, 0.02], "low")).toEqual([1, 2]);
    expect(bestIndexes([3.1, 3.1], "high")).toEqual([]);
    expect(bestIndexes([3.1, null], "high")).toEqual([]);
    expect(bestIndexes([], "high")).toEqual([]);
  });

  it("orders details by the URL slugs, drops unknown ones and caps at three", () => {
    const all = Object.values(details);
    const ordered = orderBySlugs([...all, null], ["halvard-sorensen", "nobody", "adaeze-okonkwo", "rafael-ibarra-quintero", "achterberg-n"]);
    expect(ordered.map((d) => d.professor.slug)).toEqual(["halvard-sorensen", "adaeze-okonkwo", "rafael-ibarra-quintero"]);
  });
});
