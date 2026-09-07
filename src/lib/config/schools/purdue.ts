// Purdue University, West Lafayette — a REAL school (MULTI_SCHOOL_DESIGN §1, §4.1, §4.2).
// Grades: the boiler-grades per-term CSVs (eduxstad/boiler-grades; Indiana public records obtained by
// APRA request) — per-section PERCENTAGES with no student counts, so every section is one percent-only
// row (§4.1). Schedule: purdue.io (no seat counts). Reviews: none (docs/LEGAL.md).
// Subjects: 20 of the largest by graded sections in the CSVs that fit the §6 size budgets as enforced by
// scripts/build-rankings.ts. Purdue publishes one row per SECTION (recitations included), so a subject
// has far more instructor entities than at UIUC; measured on 2026-09-06 the five largest subjects blow
// the per-file budgets and are left out until a budget decision: MA (532 instructors, rankings 1.54 MB,
// detail 1.61 MB), CHM (357, 1.08 MB), ECE (251, 0.90 MB), ME (220, 0.85 MB), MGMT (273, 0.67 MB), BIOL (0.79 MB).
import type { SchoolConfig } from './types';

/** Largest Purdue subjects by sections with a letter-grade curve that fit the §6 budgets (largest first). */
export const PURDUE_SUBJECTS: readonly string[] = [
  'SCLA', 'COM', 'ENGL', 'AAE', 'AD', 'STAT', 'CS', 'EDPS', 'SPAN', 'EDCI',
  'AT', 'HONR', 'PSY', 'ECON', 'ENGR', 'CNIT', 'CE', 'CGT', 'EAPS', 'PHYS',
];

/** Subjects excluded for size only (see the header comment); enable by raising the build-rankings budgets. */
export const PURDUE_OVERSIZED_SUBJECTS: readonly string[] = ['MA', 'CHM', 'ECE', 'ME', 'MGMT', 'BIOL'];

export const PURDUE: SchoolConfig = {
  id: 'purdue',
  name: 'Purdue University',
  shortName: 'Purdue',
  timezone: 'America/Indiana/Indianapolis',
  mode: 'live',
  currentTerm: '2026-fa',
  subjects: [...PURDUE_SUBJECTS],
  sources: {
    grades: { kind: 'purdue-boiler-grades' },
    schedule: { kind: 'purdue-io' },
    reviews: null,
  },
  seatStatusAvailable: false, // purdue.io lists sections and meetings only — no seats (§4.2)
  gradeBuckets: 'plus-minus',
  gradeValueKind: 'percent',  // §4.1: percentages per section, no student counts → "N sections"
  attribution: {
    grades: 'Official per-section grade percentages from the Boilergrades dataset (eduxstad/boiler-grades, GPL-3.0), obtained from Purdue University under Indiana public records law.',
    schedule: 'Course schedule from the purdue.io public API (api.purdue.io); seat availability is not exposed.',
  },
};
