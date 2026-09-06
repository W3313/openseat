// Deliberate edge cases the seed plants (SPEC 6.5, items (a)–(l)). The generator records one entry per
// id in `meta.edgeCases` with concrete identifiers so tests/unit/seedDeterminism.test.ts can verify
// every case actually exists in the emitted data, and ingest can copy the list into meta.json.

export type EdgeCaseId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l';

export const EDGE_CASE_IDS: readonly EdgeCaseId[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

export const EDGE_CASE_TITLES: Readonly<Record<EdgeCaseId, string>> = {
  a: 'Two CS professors share a surname with different first names',
  b: 'Two CS professors share surname and first initial; one has grade rows only as "Last, F" (ambiguous → grades-only entity)',
  c: 'Hyphenated surname written unhyphenated in some grade rows',
  d: 'Diacritic surname stripped in some grade rows',
  e: 'Nickname pair: review-source "Robert" vs grade rows "Last, Bob"',
  f: 'One "Last, First Jr" suffix grade row',
  g: 'Five grades-only instructors with no review record (one per subject except CHEM)',
  h: 'One professor with reviews but zero grade rows ("New — no grade data yet")',
  i: 'One "Staff" row and one empty-instructor row per subject',
  j: 'One co-taught section (two instructors on one CRN)',
  k: 'One cross-listed section (CS 4xx / ECE 4xx sharing a CRN)',
  l: 'One course with zero open sections',
};

/** Free-form details are strings, numbers or string lists so the record is trivially JSON-stable. */
export type EdgeCaseDetails = Record<string, string | number | boolean | null | readonly string[]>;

export interface EdgeCaseRecord {
  id: EdgeCaseId;
  title: string;
  details: EdgeCaseDetails;
}

export function edgeCase(id: EdgeCaseId, details: EdgeCaseDetails): EdgeCaseRecord {
  return { id, title: EDGE_CASE_TITLES[id], details };
}
