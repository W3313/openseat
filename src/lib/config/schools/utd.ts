// The University of Texas at Dallas — a REAL, grades-only school (MULTI_SCHOOL_DESIGN §1, §4.2, §5, §6).
// Grades: per-section letter counts with +/- from the acmutd/utd-grades raw CSVs (one file per term).
// Schedule: none verified (coursebook is session-gated) → seatStatusAvailable false, schedule null.
// Reviews: none (docs/LEGAL.md). Subjects: the 20 largest by graded students in the 6-year window
// (measured 2026-09-06 on 2020-fa … 2025-fa: CS 168.7k students down to ECS 19.3k).
import type { SchoolConfig } from './types';

/** The 20 largest UTD subjects by in-window graded students (MULTI_SCHOOL_DESIGN §6), descending. */
export const UTD_SUBJECTS: readonly string[] = [
  'CS', 'BIOL', 'CHEM', 'MATH', 'OPRE', 'PHYS', 'PSY', 'ACCT', 'ATCM', 'ITSS',
  'BUAN', 'FIN', 'MKT', 'MECH', 'GOVT', 'MIS', 'NSC', 'BCOM', 'HIST', 'ECS',
];

export const UTD: SchoolConfig = {
  id: 'utd',
  name: 'The University of Texas at Dallas',
  shortName: 'UTD',
  timezone: 'America/Chicago',
  mode: 'live',
  currentTerm: '2026-fa',
  subjects: [...UTD_SUBJECTS],
  sources: {
    grades: { kind: 'utd-grades-csv' },
    schedule: null, // no verified public schedule API (§4.2)
    reviews: null,
  },
  seatStatusAvailable: false,
  gradeBuckets: 'plus-minus',
  gradeValueKind: 'counts',
  attribution: {
    grades:
      'Grade distributions from the UTD Grades raw data (acmutd/utd-grades, MIT-licensed repository). ' +
      'Provenance is inferred to be UT Dallas records released under the Texas Public Information Act and has not been confirmed with the university.',
  },
};
