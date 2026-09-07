# Multi-school design (contract for the multi-school build, 2026-09-06)

This document is the implementation contract for adding schools beyond UIUC. It supersedes the
single-school assumptions in `docs/SPEC.md` where they conflict. Sections marked **decision** are settled;
do not re-litigate them in code review.

## 1. Product framing (decision)

- Production ships **real data**: official per-instructor grade distributions plus this-term schedules where a
  public source exists. **No scraped reviews** for any school (see `docs/LEGAL.md`). Review-dependent UI
  degrades gracefully (section 5).
- The fictional dataset remains available as a **separate school id `demo`** ("Demo University — fictional
  professors on the UIUC catalog") for development, tests and an optional showcase. It is never mixed with a
  real school's data. Whether `demo` appears in production is controlled by the `SCHOOLS` env allowlist.
- `uiuc` becomes a real school (grades from the UIUC GPA dataset, schedule from Course Explorer, reviews none).

## 2. School registry (decision)

`src/lib/config/schools.ts` becomes the single source of truth. `SchoolId` in `types.ts` widens to `string`
(validated against the registry at runtime; `toSchoolId()` stays the only entry point).

```ts
export interface SchoolConfig {
  id: string;                       // 'uiuc' | 'tamu' | 'utexas' | ... | 'demo'  (lowercase, [a-z0-9-]{2,12})
  name: string; shortName: string; timezone: string;
  mode: 'live' | 'demo';            // per school, replaces the global DATA_MODE
  currentTerm: TermCode;
  subjects: string[] | 'all';       // subject allowlist for ingest + static generation (size budget, section 6)
  sources: {
    grades: { kind: string; ...opts };      // adapter id + options, e.g. { kind: 'uiuc-gpa-csv' }
    schedule: { kind: string; ...opts } | null;
    reviews: null;                          // always null for real schools
  };
  seatStatusAvailable: boolean;     // true only when the schedule source exposes seats
  gradeBuckets: 'plus-minus' | 'letter-only' | 'letter-with-w'; // what the source provides (section 4)
  attribution: { grades: string; schedule?: string };            // footer / about text
}
```

`SCHOOLS` env (comma list, default: every registered school) selects which schools are ingested, statically
generated and listed on the landing page. `DATA_MODE`, `REVIEW_SOURCE`, `RMP_ENABLED` are removed from env
(the RMP adapter stays in the repo, wired only by an explicit `sources.reviews` entry that no registered
school uses; `RMP_AUTH_HEADER` remains required if someone wires it locally).

## 3. Data layout (decision)

```
data/processed/<school>/
  school.json subjects.json courses.json professors.json sections.json meta.json match-report.json
  grades/<SUBJECT>.json          # split per subject (was one grades.json)
  rankings/<SUBJECT>.json
  professors-detail/<SUBJECT>.json   # split per subject; a professor appears in each subject they teach
  summaries.json                 # empty {} for real schools
```

`JsonRepository` loads per-subject files lazily and caches them. All JSON is written compact (no indentation)
via `stableStringify(..., { indent: 0 })` — deterministic key order is kept.

## 4. Grade-bucket normalisation

Sources differ: UIUC has A+…D-, F, W; Texas A&M has A–F, I, S, U, Q (drop), X; UT Austin has A–F with +/-;
Wisconsin has A, AB, B, BC, C, D, F; some publish counts, some percentages. Adapters map into the existing
`GradeBuckets` shape with these rules (document per adapter):

- Letters without +/- map to the plain bucket (`B` → `b`); AB/BC (Wisconsin) split 50/50 into the adjacent
  plain buckets and the adapter records `bucketPrecision: 'coarse'` on the row.
- Withdrawals/drops (W, Q) → `w`; incompletes, S/U, pass/fail, audits are excluded from `graded` and recorded
  in `meta.excludedGradeCodes` with counts.
- Percentages are converted to counts using the row's enrollment; if enrollment is missing the row is dropped
  and counted in `meta.droppedRows`.
- GPA points table is unchanged (A+ = A = 4.0). `School.gradeBuckets` drives the GradeBar legend so a
  letter-only school never shows empty +/- segments.

### 4.1 Percent-only sources (decision, added after scouting)

Purdue (and Georgia Tech, UCSD) publish per-section grade **percentages with no student count**. Rule:
- Each such section becomes one `GradeRow` whose `buckets` hold the letter **and W** percentages scaled to
  integers summing to 100 (largest-remainder rounding; excluded codes such as S/U/I/AU drop out of the
  denominator), so `students = 100`, `graded = 100 − W%`, `weight = 1`, `percentOnly = true` — W stays a share of
  the section and `wRate` equals the published W%. (Amended 2026-09-06: the first draft said `graded = 100`;
  scaling letters alone to 100 would have made `wRate` diverge from the source.) Aggregation therefore
  weights every section equally; `studentsGraded` for such rows is reported as `null` in the UI ("N sections",
  not "N students"), and `MIN_GRADED_N` suppression is replaced by `MIN_SECTIONS_N = 2` for percent-only
  professors **and courses** (`Course.gpaMean` needs ≥ 2 sections too). Leave-one-out baselines use the same
  section weighting within the course.
- Data-quality rules for the Purdue files (verified 2026-09-06): a CRN listed more than once in a term (the full
  distribution plus coarse sub-cohort rows such as `A 100%`) keeps only the row with the most non-zero grade
  codes — the rest count in `meta.droppedRows`; a row whose percentages are all multiples of 1/n for one
  n ≤ 3 (`100`, `50/50`, `33.3/66.7`) implies a ≤ 3-student cohort and is emitted with `suppressed = true`
  (kept for provenance, excluded from every aggregate).
- `meta.excludedGradeCodes` and `meta.droppedRows` are **row counts over the rows inside the grade window**
  (every subject the file covers, before the subject allowlist), for every adapter.
- `GradeRow` gains `percentOnly?: boolean` and `weight?: number` (default 1); `ProfessorScores` gains
  `sectionsGraded` (already exists as gradeRows) semantics and `countsAreEstimates: boolean`; `School` gains
  `gradeValueKind: 'counts' | 'percent'` so components pick wording. Source `avgGPA` columns, where present,
  are stored on the row as `sourceGpa` and shown in the detail table for transparency but the displayed GPA is
  recomputed from buckets for consistency across schools.

### 4.2 First-batch source facts (verified 2026-09-06 by the scouting run)

| School id | Grades | Schedule | Notes |
|---|---|---|---|
| `uh` (University of Houston) | GitHub release bundle `cougargrades/publicdata` → `edu.uh.grade_distribution/records.csv` (Fall 2013–Spring 2026; per section; full `Last, First` names; A–F counts, no +/-; SATISFACTORY/NOT REPORTED/TOTAL DROPPED codes; TPIA public records; npm package MIT) | `POST https://classbrowser.uh.edu/api/courses` (no auth; terms `/api/terms`, subjects `/api/subjects`; `Last,First` names; meeting times; open/closed) | seatStatusAvailable true |
| `ucsb` (UC Santa Barbara) | `https://raw.githubusercontent.com/dailynexusdata/grades-data/main/courseGrades.csv` (Fall 2009–Spring 2026; course × instructor × quarter aggregate; counts with +/- as Ap/Am…; nLetterStudents; avgGPA; no W; README "free to reuse"; CPRA records) | `https://api.ucsb.edu/academics/curriculums/v3/classes/search` needs free `ucsb-api-key` → env `UCSB_API_KEY`; grades-only when absent | instructor `LAST F M` initials |
| `purdue` (Purdue West Lafayette) | `https://raw.githubusercontent.com/eduxstad/boiler-grades/main/<term>.csv` (per term through spring2026; per section with CRN; `Last, First M.`; PERCENTAGES only, sections >10 students; codes E/AU/I/N/P/PI/S/SI/U/W; schema drift per term, semicolon in some files, cascading blanks → fill-forward; GPL-3.0 repo, Indiana public records) | `https://api.purdue.io/odata/Sections?$filter=…&$expand=Class($expand=Course($expand=Subject)),Meetings($expand=Instructors)` (no auth; CRN join; no seats) | percentOnly |
| `utd` (UT Dallas) | `https://raw.githubusercontent.com/acmutd/utd-grades/master/raw_data/enhanced_grades_enhanced_grades_<term>.csv` (one per term, latest 25f; per section; counts with +/-; CR/I/NC/W/P; up to 6 instructors + normalized instructor id; term only in filename; empty = 0; MIT repo; provenance to confirm) | none verified (coursebook is session-gated) | grades-only |
| `uiuc` | existing `UiucGpaCsvSource` | existing `CourseExplorerSource` | now a real school; 25-subject allowlist |
| `demo` | existing fictional generator (moved from school id `uiuc`) | demo schedule | full review UI |

## 5. Grades-only mode (decision)

When a school has `sources.reviews === null` (all real schools):

- `applyRankingsQuery` does **not** split by `MIN_REVIEWS_RANKED`; every professor with grade rows is
  ranked. Default sort is `gpa` (delta desc, GPA desc, students graded desc). The `rating`, `overall` and
  `reviews` sorts are hidden in `SortSegmented` (the API still accepts them and treats them as `gpa`).
- `RatingBlock`, `ConfidenceDots`, `VibeTags`, positive quotes and `AISummaryPanel` are not rendered; the
  card shows GradeBar, DeltaChip, W-rate, sparkline, open sections and a "students graded" count instead.
- Badges limited to `open-now`, `easy-a`, `low-withdrawal`; `tough-but-loved` and `hidden-gem` need reviews.
- Titles/OG images say "ranked by grade curve"; the methodology page explains why reviews are absent and how
  to add first-party reviews later. The demo school keeps the full review UI.
- `RankingsPayload.school.reviewsAvailable: boolean` is the switch the client reads.

## 6. Size and static-generation budget (decision)

- Per school: `data/processed/<school>` ≤ 12 MB committed; each `rankings/*.json` ≤ 250 KB;
  `professors-detail/<SUBJECT>.json` ≤ 1.5 MB. `tests/unit/dataSize.test.ts` iterates every school directory.
- `subjects` allowlist keeps first releases inside budget. Measured on the real UIUC CSV (2026-09-06): the
  6-year window holds 28,885 instructor-attributed grade rows across 159 subjects (4,874 distinct instructor
  strings); compact JSON is ≈ 440 bytes/row, so **all subjects ≈ 12.7 MB of grade rows alone** and the 25
  largest subjects (CS, BADM, CHEM, MATH, ACCY, ECON, FIN, ECE, STAT, PSYC, MBA, PHYS, MCB, RST, CHLH, ACE, KIN,
  ANTH, HK, IS, CMN, ME, ANSC, IB, ADV) ≈ 6.9 MB. First release: UIUC uses that 25-subject list; other schools
  start with their 15–20 largest subjects. `stableStringify` already accepts `{ indent: 0 }`.
- Static generation: `generateStaticParams` enumerates `SCHOOLS` × subjects × professors. Cap total professor
  pages at ~3,000 per build; beyond that, professor pages switch to `dynamicParams = true` with ISR
  (`revalidate = 86400`) — note it in the README if triggered.

**Commit policy (decision, 2026-09-06):** `grades/<SUBJECT>.json` files are pipeline artifacts that no page or API reads at request time; they are gitignored for real schools (kept for `demo`, which the determinism test needs) and excluded from serverless bundles via `outputFileTracingExcludes`. Committed size per real school is therefore rankings + professors-detail + small metadata files (≈ 10–17 MB each with the current subject allowlists; the original 12 MB target was not met and the caps in `tests/unit/dataSize.test.ts` were raised — a database-backed repository is the planned fix, see GO_LIVE.md).

## 7. Adapter contract

Each new school adds `src/lib/sources/<school>/` with a `GradeSource` (and `ScheduleSource` when available),
a `scripts/fetch-<school>.ts` that downloads the raw files to `data/raw/<school>/` (gitignored) with a
descriptive User-Agent, a `tests/fixtures/<school>-*.{csv,json,xml}` sample (200 rows, real shape; instructor
names in fixtures must be **fictional**), and `tests/unit/<school>.test.ts`. Instructor strings are parsed
with the existing matcher (`Last, First M` / `Last, F` / `First Last` are all supported). Every adapter
records `SourceInfo { id, label, url, license }` truthfully — `license: null` when none is declared.

## 8. UI

- Landing `SchoolSelect` lists registry schools (name + "N professors · M subjects"); the last choice is
  remembered per browser. URL structure is unchanged (`/s/<school>/<SUBJECT>`, `/p/<school>/<slug>`).
- `ModeBadge` shows only on `demo`. Real schools show a `DataBadge` "Official grade data · <attribution>".
- Footer provenance is per school.

## 9. Out of scope for this build

Cross-school comparison, user accounts, first-party reviews (planned next), seat-availability alerts.
