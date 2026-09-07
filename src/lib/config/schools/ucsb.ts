// University of California, Santa Barbara — a REAL school (MULTI_SCHOOL_DESIGN §1, §4.2 "ucsb", §6).
// Grades: the Daily Nexus grades dataset (dailynexusdata/grades-data, California Public Records Act
// records from the UCSB Office of the Registrar; README: "All data is free to reuse"). Schedule: the UCSB
// Curriculums API, which needs a free developer key (env UCSB_API_KEY) — grades-only when absent.
// Reviews: none (docs/LEGAL.md).
//
// Source quirks the adapter documents (src/lib/sources/ucsb/): quarters (Winter/Spring/Summer/Fall →
// wi/sp/su/fa), plus/minus counts as Ap/Am…, NO withdrawal column (W is always 0), P/NP/S/U/IP excluded
// and counted in meta.excludedGradeCodes, instructor "LAST F M" truncated at 13 characters, and subject
// codes reduced to letters ("POL S" → POLS, "ENV S" → ENVS) with course prefixes folded into the number
// ("PSTAT W120A" is the summer-online variant of PSTAT 120A; "ART CS 112" a College of Creative Studies course).
import type { SchoolConfig } from './types';

/**
 * The 20 largest UCSB subjects by letter-graded students inside the 6-year window (2020-fa → 2026-sp),
 * measured on the full CSV on 2026-09-06 (≈ 14,700 grade rows in total):
 * CHEM 101,817 · ECON 93,511 · PHYS 91,449 · MCDB 88,853 · MATH 88,041 · EEMB 79,479 · PSY 73,010 ·
 * SOC 66,203 · PSTAT 63,732 · COMM 54,363 · HIST 53,696 · ENGL 46,682 · WRIT 45,365 · CMPSC 44,653 ·
 * ENVS 42,921 · EARTH 27,058 · PHIL 27,036 · POLS 26,762 · ECE 26,641 · ANTH 25,218.
 */
export const UCSB_SUBJECTS: readonly string[] = [
  'CHEM', 'ECON', 'PHYS', 'MCDB', 'MATH', 'EEMB', 'PSY', 'SOC', 'PSTAT', 'COMM',
  'HIST', 'ENGL', 'WRIT', 'CMPSC', 'ENVS', 'EARTH', 'PHIL', 'POLS', 'ECE', 'ANTH',
];

/** Human names for the allowlisted subjects (for data/config/ucsb/departments.json if it is created). */
export const UCSB_SUBJECT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  CHEM: 'Chemistry and Biochemistry', ECON: 'Economics', PHYS: 'Physics', MCDB: 'Molecular, Cellular and Developmental Biology',
  MATH: 'Mathematics', EEMB: 'Ecology, Evolution and Marine Biology', PSY: 'Psychological and Brain Sciences', SOC: 'Sociology',
  PSTAT: 'Statistics and Applied Probability', COMM: 'Communication', HIST: 'History', ENGL: 'English', WRIT: 'Writing',
  CMPSC: 'Computer Science', ENVS: 'Environmental Studies (ENV S)', EARTH: 'Earth Science', PHIL: 'Philosophy',
  POLS: 'Political Science (POL S)', ECE: 'Electrical and Computer Engineering', ANTH: 'Anthropology',
});

export const UCSB: SchoolConfig = {
  id: 'ucsb',
  name: 'University of California, Santa Barbara',
  shortName: 'UCSB',
  timezone: 'America/Los_Angeles',
  mode: 'live',
  currentTerm: '2026-fa',
  subjects: [...UCSB_SUBJECTS],
  sources: {
    grades: { kind: 'ucsb-daily-nexus-csv' },
    // No-op without env UCSB_API_KEY. `seats: true` switches to open/closed from enrolledTotal/maxEnroll
    // once the semantics have been verified against a live key (then flip seatStatusAvailable too).
    schedule: { kind: 'ucsb-curriculums', seats: false },
    reviews: null,
  },
  seatStatusAvailable: false,
  gradeBuckets: 'plus-minus',
  gradeValueKind: 'counts',
  attribution: {
    grades:
      'Official grade distributions from the Daily Nexus grades dataset (dailynexusdata/grades-data), obtained from the UCSB Office of the Registrar under the California Public Records Act; withdrawals are not reported, and P/NP, S/U and In-Progress grades are excluded.',
    schedule:
      'Course schedule from the UCSB Curriculums API (api.ucsb.edu; free developer key from developer.ucsb.edu required, otherwise grades-only); seat availability is not shown.',
  },
};
