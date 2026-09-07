// University of Illinois Urbana-Champaign — a REAL school (MULTI_SCHOOL_DESIGN §1, §4.2, §6).
// Grades: the public UIUC GPA dataset (Illinois public records). Schedule: Course Explorer (no seat data).
// Reviews: none (docs/LEGAL.md). Subjects: the 25 largest by grade rows so the dataset stays inside the
// §6 size budget (≈ 6.9 MB of grade rows measured on 2026-09-06).
import type { SchoolConfig } from './types';

/** The 25 largest UIUC subjects by in-window grade rows (MULTI_SCHOOL_DESIGN §6). */
export const UIUC_SUBJECTS: readonly string[] = [
  'CS', 'BADM', 'CHEM', 'MATH', 'ACCY', 'ECON', 'FIN', 'ECE', 'STAT', 'PSYC', 'MBA', 'PHYS', 'MCB', 'RST', 'CHLH',
  'ACE', 'KIN', 'ANTH', 'HK', 'IS', 'CMN', 'ME', 'ANSC', 'IB', 'ADV',
];

export const UIUC: SchoolConfig = {
  id: 'uiuc',
  name: 'University of Illinois Urbana-Champaign',
  shortName: 'UIUC',
  timezone: 'America/Chicago',
  mode: 'live',
  currentTerm: '2026-fa',
  subjects: [...UIUC_SUBJECTS],
  sources: {
    grades: { kind: 'uiuc-gpa-csv' },
    schedule: { kind: 'uiuc-course-explorer' },
    reviews: null,
  },
  seatStatusAvailable: false, // Course Explorer exposes statusCode only — no seats (SOURCE_FACTS §2)
  gradeBuckets: 'plus-minus',
  gradeValueKind: 'counts',
  attribution: {
    grades: 'Official grade distributions from the University of Illinois GPA dataset (wadefagen/datasets), compiled from Illinois public records.',
    schedule: 'Course schedule from the UIUC Course Explorer public API (courses.illinois.edu); seat availability is not exposed.',
  },
};
