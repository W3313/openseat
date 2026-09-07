/** Any registered school id (MULTI_SCHOOL_DESIGN §2); validated at runtime by `toSchoolId()` in src/lib/config/schools. */
export type SchoolId = string;
export type Season = 'wi' | 'sp' | 'su' | 'fa';
export type TermCode = `${number}-${Season}`;        // "2026-fa" — same as the CSV YearTerm column
export type DataMode = 'demo' | 'live';
export type SortKey = 'rating' | 'overall' | 'gpa' | 'reviews';
export type Day = 'M' | 'T' | 'W' | 'R' | 'F' | 'S' | 'U';

/** What the grade source publishes; drives the GradeBar legend (MULTI_SCHOOL_DESIGN §4). */
export type GradeBucketKind = 'plus-minus' | 'letter-only' | 'letter-with-w';
/** counts = real student counts; percent = per-section percentages (§4.1: "N sections", never "N students"). */
export type GradeValueKind = 'counts' | 'percent';

export interface School {
  id: SchoolId;
  name: string;                                      // "University of Illinois Urbana-Champaign"
  shortName: string;                                 // "UIUC"
  mode: DataMode;                                    // per school (MULTI_SCHOOL_DESIGN §2); 'demo' only for the fictional school
  currentTerm: TermCode;                             // the term rankings are built for
  timezone: string;                                  // "America/Chicago" — all meeting times & stamps display in this zone
  seatStatusAvailable: boolean;                      // demo: true; real Course Explorer: false (no seat data in the API)
  reviewsAvailable: boolean;                         // false for every real school → grades-only mode (MULTI_SCHOOL_DESIGN §5)
  gradeBuckets: GradeBucketKind;                     // legend shape (§4)
  gradeValueKind: GradeValueKind;                    // wording: students vs sections (§4.1)
  attribution: { grades: string; schedule?: string };   // footer / about text (§2)
  sources: { grades: string; schedule: string; reviews: string };   // adapter ids, e.g. "uiuc-gpa-csv" | "demo-grades"; 'none' when absent
}

export interface Subject {
  schoolId: SchoolId; code: string; name: string;    // "CS", "Computer Science"
  courseCount: number; professorCount: number; openSectionCount: number;
}

export interface GradeBuckets {                      // raw counts; keys mirror the CSV columns
  aPlus: number; a: number; aMinus: number; bPlus: number; b: number; bMinus: number;
  cPlus: number; c: number; cMinus: number; dPlus: number; d: number; dMinus: number; f: number; w: number;
}

export interface Course {
  id: string;                                        // "uiuc:CS:225"
  schoolId: SchoolId; subject: string; number: string; title: string;
  level: 100 | 200 | 300 | 400 | 500;                // Math.min(500, Math.floor(parseInt(number) / 100) * 100)
  gpaMean: number | null;                            // enrollment-weighted over ALL headline, in-window, non-suppressed rows (incl. empty-instructor rows); null if graded < MIN_GRADED_N
  graded: number; withdrawn: number; wRate: number | null;
  instructorCount: number;                           // distinct professorIds with headline rows in this course
  buckets: GradeBuckets;                             // summed over the same rows
}

/** Sched types whose Primary Instructor is typically a TA; excluded from headline stats, shown only in CourseBreakdownTable. */
export const TA_SCHED_TYPES: ReadonlySet<string> = new Set(['DIS', 'LAB', 'LBD', 'OLB', 'Q']);

export type MatchMethod =
  | 'alias' | 'exact' | 'first-token' | 'initial' | 'nickname' | 'compound-last' | 'fuzzy'
  | 'ambiguous' | 'unmatched' | 'blocked'
  | 'grades-only';                                   // a grade string with no reviewed match became (or merged into) its own grades-only professor

export interface NameKey {
  raw: string;                                       // trimmed original, e.g. "Okonkwo, Adaeze M"
  last: string;                                      // normalized, space-joined: "van der berg"
  lastTokens: string[];                              // ["van","der","berg"]
  lastCompact: string;                               // "vanderberg"
  first: string;                                     // normalized full first (incl. middle tokens): "adaeze m"
  firstTokens: string[];                             // ["adaeze","m"]
  firstCompact: string;                              // "adaezem" — firstTokens joined; lets "hua-hua" equal "huahua"
  firstToken: string;                                // "adaeze" ('' if none)
  firstInitial: string;                              // "a" ('' if none)
  middleInitials: string[];                          // ["m"] — initials of firstTokens[1..]
}

export interface GradeRow {                          // one CSV row = one (term, course, schedType, primary instructor) aggregate
  id: string;                                        // sha1(`${schoolId}|${courseId}|${term}|${schedType}|${instructorRaw}`).slice(0,16)
  schoolId: SchoolId; courseId: string; term: TermCode; year: number;
  schedType: string;                                 // upper-cased; '' → 'UNKNOWN'
  isHeadline: boolean;                               // !TA_SCHED_TYPES.has(schedType)
  instructorRaw: string;                             // exactly as in source (trimmed); '' when the CSV cell is empty
  nameKey?: NameKey | null;                          // null when instructorRaw is '' or blocked; OMITTED in grades/<SUBJECT>.json (derivable: parseName(instructorRaw)) to stay in the §6 size budget
  professorId: string | null;                        // null when unmatched/ambiguous/blocked/empty
  matchMethod: MatchMethod; matchScore: number;      // 0 when no match
  buckets: GradeBuckets;
  graded: number;                                    // Σ letter counts (excludes W)
  withdrawn: number;                                 // = buckets.w
  students: number;                                  // graded + withdrawn (= CSV Students)
  gpa: number | null;                                // null when graded === 0
  suppressed: boolean;                               // graded < MIN_GRADED_N → excluded from every aggregate, kept for provenance
  percentOnly?: boolean;                             // §4.1: buckets are percentages scaled to 100; graded = 100; counts are not students
  weight?: number;                                   // §4.1: aggregation weight (default 1); percent-only sections weigh 1 each
  sourceGpa?: number | null;                         // §4.1: avgGPA column as published by the source (display only; GPA is recomputed)
  bucketPrecision?: 'exact' | 'coarse';              // §4: 'coarse' when AB/BC-style letters were split across adjacent buckets
}

export type SectionStatus =
  | 'open' | 'waitlist' | 'closed'                   // demo source (seat status known)
  | 'offered' | 'inactive'                           // real Course Explorer (statusCode 'A' → offered; else inactive); seats unknown
  | 'unknown';

export interface Meeting {
  days: Day[];                                       // [] for ARRANGED / online
  start: string | null; end: string | null;          // "HH:MM" 24h wall-clock in School.timezone; null when arranged
  building: string | null; room: string | null;
  type: string;                                      // "LEC" | "LCD" | "DIS" | "LAB" | "ONL" | ...
}

export interface Section {
  id: string;                                        // `${schoolId}:s:${term}:${crn}`
  schoolId: SchoolId; term: TermCode;
  courseId: string;                                  // canonical course (alphabetically first subject when cross-listed)
  crossListedCourseIds: string[];                    // other course ids carrying the same CRN this term
  crn: string; sectionCode: string;                  // "65054", "AL1"
  type: string;                                      // primary meeting type, e.g. "LEC"
  status: SectionStatus;
  seatsKnown: boolean;                               // false for the real adapter
  isOpen: boolean;                                   // status === 'open' || status === 'offered'
  instructorsRaw: string[];                          // trimmed "Last, F" strings, deduped, in source order
  professorIds: string[];                            // resolved (may be empty); co-taught when length > 1
  meetings: Meeting[];
  fetchedAt: string;                                 // ISO UTC
}

export type VibeTag =
  | 'clear-lectures' | 'engaging' | 'caring' | 'fair-grading' | 'curves-generously' | 'great-notes'
  | 'heavy-homework' | 'hard-exams' | 'fast-paced' | 'disorganized' | 'strict-attendance' | 'must-read-textbook';
export const POSITIVE_VIBE_TAGS: ReadonlySet<VibeTag> = new Set(['clear-lectures','engaging','caring','fair-grading','curves-generously','great-notes']);

export interface Professor {
  id: string;                                        // `${schoolId}:p:${slug}` (reviewed) | `${schoolId}:g:${slug}` (grades-only)
  schoolId: SchoolId;
  slug: string;                                      // URL segment; unique across both kinds; "adaeze-okonkwo" | "okonkwo-j"
  kind: 'reviewed' | 'grades-only';
  displayName: string;                               // "Adaeze Okonkwo" | "J. Okonkwo" (grades-only from "Okonkwo, J")
  firstName: string; lastName: string;               // original casing/diacritics from the review source or reconstructed from raw
  nameKey: NameKey;
  department: string | null;                         // "Computer Science" (review source) | null
  subjects: string[];                                // subjects with ≥1 grade row, section or review course
  courseIds: string[];                               // courses with ≥1 grade row or section
  nameVariants: string[];                            // every raw instructor string linked to this person
  reviewSourceId: string | null;                     // RMP node id or demo id; null for grades-only
  isFictional: boolean;                              // true for every demo professor
}

export interface Review {
  id: string; professorId: string;
  courseId: string | null; courseLabel: string | null;   // "uiuc:CS:225", "CS 225"
  date: string;                                      // "2025-05-14"
  quality: number; difficulty: number | null;        // 1..5
  wouldTakeAgain: boolean | null; gradeReceived: string | null;
  text: string;
  sourceTags: string[];                              // as given by the source (RMP ratingTags / demo)
  vibeTags: VibeTag[];                               // derived at ingest by lexicon
  helpfulVotes: number;                              // thumbsUp − thumbsDown, floored at 0
  sentiment: number;                                 // −1..1, computed at ingest (Section 8.8)
}

export type ConfidenceLabel = 'low' | 'medium' | 'high';
export type BadgeId = 'open-now' | 'tough-but-loved' | 'easy-a' | 'hidden-gem' | 'low-withdrawal';

export interface ProfessorScores {
  reviewCount: number; ratingRaw: number | null; ratingShrunk: number | null; priorMean: number;
  confidence: ConfidenceLabel;                       // from reviewCount only (Section 8.4)
  difficultyMean: number | null; wouldTakeAgainPct: number | null;   // pct 0..100
  positiveCount: number; criticalCount: number;      // quality ≥ 4 / quality ≤ 2
  gradeRows: number;                                 // headline, in-window, non-suppressed rows attributed to this professor (in scope)
  studentsGraded: number; withdrawn: number;
  gpaMean: number | null; aRate: number | null; wRate: number | null; dfwRate: number | null;
  gpaDelta: number | null; deltaComparableN: number; soleInstructor: boolean;   // Section 8.3
  composite: number | null;                          // 0..100, null when ratingShrunk is null
  yearsActive: number;                               // distinct years with headline rows
  countsAreEstimates: boolean;                       // §4.1: true when every row is percent-only → studentsGraded/withdrawn are not real counts; gradeRows = sections
}

export interface GpaPoint { year: number; gpa: number; n: number; }

export interface CourseBreakdown {
  courseId: string; subject: string; number: string; title: string;
  gradeRows: number; graded: number; withdrawn: number;
  gpa: number | null; aRate: number | null; wRate: number | null; dfwRate: number | null;
  baselineGpa: number | null; baselineN: number;     // leave-one-out (others), same window
  delta: number | null;                              // gpa − baselineGpa; null when baselineN < MIN_BASELINE_N or gpa null
  buckets: GradeBuckets;
  isHeadline: boolean;                               // false → TA sched types only (detail toggle)
  sourceGpa?: number | null;                         // §4.1: graded-weighted mean of the rows' published avgGPA (UH, UCSB); absent when no row carries one
}

export interface MatchProvenance {
  instructorRaw: string; source: 'grades' | 'schedule';
  method: MatchMethod; score: number; rows: number;  // rows = grade rows or sections carrying this string
}

export type SummarySource = 'claude' | 'openai-compatible' | 'extractive';
export type Workload = 'light' | 'moderate' | 'heavy';
export type TeachingFormat = 'lecture-heavy' | 'discussion' | 'project-based' | 'mixed';

export interface ProfessorSummary {
  professorId: string; source: SummarySource; model: string | null;
  provider?: string;                                 // display name of an OpenAI-compatible provider ("Groq"); absent for claude/extractive
  promptVersion: number; generatedAt: string; inputHash: string; reviewCount: number;
  verdict: string;                                   // ≤ 160 chars, one sentence
  teachingStyle: string[];                           // 2–4 phrases ≤ 40 chars
  strengths: string[];                               // 2–4 items ≤ 90 chars
  watchOuts: string[];                               // 1–3 items ≤ 90 chars
  bestFor: string;                                   // ≤ 140 chars
  workload: Workload; format: TeachingFormat;
  confidence: ConfidenceLabel;                       // ALWAYS overwritten by rule from reviewCount
  evidenceReviewIds: string[];                       // 1–12 ids present in the input review set
  gradingNote: string;                               // ALWAYS generated by code from grade data (Section 9.6)
}

export interface RankedProfessor {
  rank: number | null;                               // 1-based after filter+sort; null in the precomputed payload and in lowData
  professor: Professor; scores: ProfessorScores; badges: BadgeId[]; vibeTags: VibeTag[];
  distribution: GradeBuckets;                        // headline rows in scope (subject or course)
  gpaByYear: GpaPoint[];                             // years with n ≥ MIN_GRADED_N
  courses: CourseBreakdown[];                        // every course this professor has rows in (headline and TA rows as separate entries)
  openSections: Section[];                           // isOpen sections in currentTerm within scope
  sectionsThisTerm: number;                          // all statuses within scope
  positiveReviews: Review[];                         // ≤ 3 (card shows 2)
  summary: ProfessorSummary | null;
  matchProvenance: MatchProvenance[];
}

export interface CourseRef { courseId: string; number: string; title: string; professorCount: number; }

export type RankingsScope = { kind: 'subject' } | { kind: 'course'; courseId: string };

/** Precomputed, UNFILTERED per-subject payload: data/processed/<school>/rankings/<SUBJECT>.json */
export interface RankingsPayload {
  school: School; subject: Subject; term: TermCode; scope: RankingsScope; mode: DataMode;
  generatedAt: string; seatsFetchedAt: string; gradesThroughTerm: TermCode; termFallback: boolean;
  subjectGpaMean: number | null; subjectWRate: number | null; priorMean: number;
  sparklineRange: [number, number];                  // shared y-range for every Sparkline on the page
  courses: CourseRef[];
  professors: RankedProfessor[];                     // rank: null; includes low-data and grades-only
}

export interface RankingsQuery { sort: SortKey; openOnly: boolean; course?: string; }

export interface RankingsTotals { ranked: number; lowData: number; openSections: number; reviews: number; }

/** What the page and /api/.../rankings return after applyRankingsQuery(). */
export interface RankingsResponse extends Omit<RankingsPayload, 'professors'> {
  query: RankingsQuery; totals: RankingsTotals;
  ranked: RankedProfessor[];                         // reviewCount ≥ MIN_REVIEWS_RANKED, filtered, sorted, rank 1..n
  lowData: RankedProfessor[];                        // reviewCount < MIN_REVIEWS_RANKED (rank null), sorted per Section 8.7
}

export interface ProfessorDetail {
  professor: Professor; scores: ProfessorScores;     // scores over ALL subjects (school-wide scope)
  badges: BadgeId[]; vibeTags: VibeTag[]; distribution: GradeBuckets; gpaByYear: GpaPoint[];
  courses: CourseBreakdown[]; sections: Section[];   // all sections this term, all statuses
  reviews: Review[];                                 // all, date desc
  summary: ProfessorSummary | null; matchProvenance: MatchProvenance[];
  rankBySubject: { subject: string; rank: number | null }[];   // default sort, openOnly=false
}

export interface MatchReportEntry {
  instructorRaw: string; source: 'grades' | 'schedule';
  subjects: string[];                                // every subject the string was resolved in (sorted); the same outcome in each
  method: MatchMethod; score: number; professorId: string | null; rows: number;   // rows summed over subjects
  candidates: { professorId: string; score: number; method: MatchMethod }[];   // top ≤ 3
}
export interface MatchReport {
  generatedAt: string;
  coverage: {
    distinctStrings: number;                         // = entries.length = matched + gradesOnly + ambiguous + unmatched (blocked strings are not entries)
    matched: number;                                 // linked to a reviewed professor (grades) or to any professor (schedule)
    gradesOnly: number;                              // grade strings that became their own grades-only professor
    ambiguous: number; unmatched: number; blocked: number;
    byMethod: Record<MatchMethod, number>; sectionsLinked: number; sectionsTotal: number;
    /** With reviews: matched / distinctStrings. Grades-only school: sectionsLinked / sectionsTotal (null when no schedule). */
    matchRate: number | null;
  };
  entries: MatchReportEntry[];                       // one per distinct (source, instructorRaw, outcome); a string resolving differently per subject appears once per outcome
}

export interface MetaCounts {
  professors: number; reviewedProfessors: number; gradesOnlyProfessors: number;
  gradeRows: number; courses: number; sections: number; openSections: number; reviews: number;
  summariesClaude: number; summariesExtractive: number;
  summariesOpenAiCompatible?: number;                // Groq / Ollama / OpenRouter summaries (optional: older meta files omit it)
}
export interface Meta {
  builtAt: string; mode: DataMode; seed: number | null; datasetHash: string;   // sha256 over all processed files except meta.json & summaries.json
  currentTerm: TermCode; scheduleTerm: TermCode; termFallback: boolean;        // scheduleTerm ≠ currentTerm → fallback happened
  gradesThroughTerm: TermCode; seatsFetchedAt: string;
  counts: MetaCounts;
  sources: { id: string; label: string; url: string | null; license: string | null; fetchedAt: string; recordCount: number }[];
  edgeCases: string[];                               // demo only: labels of the deliberate edge cases planted by the seed (Section 6.5); [] in live mode
  subjects?: string[];                               // MULTI_SCHOOL_DESIGN §6: the subject allowlist this dataset was ingested with
  excludedGradeCodes?: Record<string, number>;       // §4: source grade codes excluded from `graded` (I, S/U, P/NP, AU …) with row counts
  droppedRows?: number;                              // §4: source rows dropped (e.g. percentages without enrollment)
}
