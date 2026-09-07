// University of Houston — a REAL school (MULTI_SCHOOL_DESIGN §1, §4.2 row `uh`, §6).
// Grades: cougargrades/publicdata release bundle (edu.uh.grade_distribution/records.csv — Texas Public
// Information Act records; per section; A–F counts, no +/-; TOTAL DROPPED → w; SATISFACTORY / NOT REPORTED
// excluded). Schedule: the Class Browser JSON API (classbrowser.uh.edu; open/closed/wait-list seat status).
// Reviews: none (docs/LEGAL.md).
import type { SchoolConfig } from './types';

/**
 * The 20 largest UH subjects by in-window graded students (Fall 2020 → Spring 2026, measured 2026-09-06 on
 * the 2026-08-15 bundle), in that order — skipping LAW (395 distinct instructors), ENGL (317) and PSYC (237):
 * a rankings/<SUBJECT>.json for that many instructors cannot fit the §6 per-file budget.
 */
export const UH_SUBJECTS: readonly string[] = [
  'MATH', 'BIOL', 'CHEM', 'HIST', 'KIN', 'BUSI', 'MARK', 'GOVT', 'ACCT', 'COSC',
  'GEOL', 'MANA', 'PHYS', 'HLT', 'COMM', 'FINA', 'PHAR', 'OPTO', 'ECON', 'MECE',
];

export const UH: SchoolConfig = {
  id: 'uh',
  name: 'University of Houston',
  shortName: 'UH',
  timezone: 'America/Chicago',
  mode: 'live',
  currentTerm: '2026-fa',
  subjects: [...UH_SUBJECTS],
  sources: {
    grades: { kind: 'uh-cougargrades' },
    schedule: { kind: 'uh-classbrowser' },
    reviews: null,
  },
  seatStatusAvailable: true, // Class Browser exposes enrl_stat open / closed / wait list
  gradeBuckets: 'letter-with-w', // A–F plain letters plus TOTAL DROPPED → w (§4)
  gradeValueKind: 'counts',
  attribution: {
    grades:
      'Official grade distributions from the University of Houston, released under the Texas Public Information Act and ' +
      'published as the cougargrades/publicdata GitHub release bundle (edu.uh.grade_distribution/records.csv; the npm package declares MIT, the GitHub release no licence).',
    schedule: 'Course schedule and seat availability from the UH Class Browser public API (classbrowser.uh.edu).',
  },
};
