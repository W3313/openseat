# `data/` — everything the site serves and everything the pipeline reads

The app never talks to a database: `src/lib/repo/JsonRepository.ts` reads the JSON files under
`data/processed/<school>/` with `fs` at build/request time (Vercel bundles them via
`outputFileTracingIncludes` in `next.config.ts`). The pipeline (`npm run data:*`, SPEC section 6)
regenerates them deterministically. Committed processed data must stay under 5 MB in total and each
`rankings/<SUBJECT>.json` under 200 KB (`tests/unit/dataSize.test.ts`).

| Path | Committed? | Written by | Read by |
|---|---|---|---|
| `config/` | yes | `scripts/fetch-uiuc-gpa.ts` (+ hand-maintained files) | `scripts/seed-demo.ts`, `RmpReviewSource` |
| `overrides/` | yes | hand-maintained | `scripts/ingest.ts` (name matching) |
| `raw/` | only `raw/demo/**` | `scripts/fetch-uiuc-gpa.ts`, `fetch-uiuc-schedule.ts`, `seed-demo.ts` | the source adapters |
| `processed/uiuc/` | yes (fictional demo dataset) | `scripts/ingest.ts`, `build-rankings.ts`, `precompute-summaries.ts` | `JsonRepository` |
| `processed/uiuc-live/` | no (gitignored) | same scripts with `DATA_MODE=live` | `JsonRepository` when `DATA_MODE=live` |
| `cache/` | no (gitignored) | scripts, scratch | scripts |

## `config/uiuc/` — impersonal, committed inputs (SPEC 6.4)

| File | Contents |
|---|---|
| `README.md` | How the two generated files are derived and reproduced. |
| `course-priors.json` | For every real (subject, number) in `SUBJECTS` with >= 200 graded students over all years: `courseId`, `subject`, `number`, `title`, `gpaMean`, `graded`, `bucketShares` (grade buckets as fractions), `typicalRowSize` (median graded per CSV row), `wRate`, `gpaByYear`. Used **only** by the demo seed so fictional professors teach real courses with realistic grade shapes. Never served. |
| `real-instructor-keys.json` | Sorted array of `sha256(lastCompact + '|' + firstToken).slice(0, 12)` for every distinct non-empty `Primary Instructor` in the public UIUC GPA dataset (~10.5k keys). The seed re-rolls any fictional name whose key collides, so no fictional professor shares a name with a real instructor. No real name is stored. |
| `blocked-surnames.json` | Small hand-maintained list of surnames of well-known public figures (compact, lowercase). The seed re-rolls these too. |
| `departments.json` | `{ "CS": ["Computer Science"], ... }` — department names per subject code. Used by the seed (`Professor.department`) and by `RmpReviewSource` to search teachers per department. |

## `overrides/` — hand-maintained matching corrections

| File | Contents |
|---|---|
| `uiuc-instructor-aliases.json` | `{ "<instructor string as printed in the CSV or schedule>": "<professor id or slug>" }`. Consulted by the name matcher (SPEC 7) before any fuzzy scoring so a persistent mismatch can be pinned. `{}` today: the demo dataset has no overrides, and no real person is ever paired with fictional reviews. |

## `raw/` — upstream inputs

`raw/.gitignore` ignores everything except `raw/demo/**`.

| Path | Contents |
|---|---|
| `raw/uiuc/uiuc-gpa-dataset.csv` | The public UIUC GPA dataset (attributed public-records `wadefagen/datasets`, ~8.5 MB, exact 23-column header). Downloaded by `npm run data:fetch`; gitignored. |
| `raw/uiuc/<year>-<season>/<SUBJECT>/*.xml` | Course Explorer XML cached by `npm run data:schedule` in live mode (`<SUBJECT>.xml` course list plus one `<number>.xml?mode=cascade` per course). Gitignored. |
| `raw/demo/uiuc/gpa.csv` | Fictional grade rows in the exact real CSV shape, written by `npm run data:seed`. Committed. |
| `raw/demo/uiuc/sections.json` | Fictional `RawSection[]` for `CURRENT_TERM` (seat status known). Committed. |
| `raw/demo/uiuc/professors.json` | Fictional `RawProfessor[]` (`isFictional: true`). Committed. |
| `raw/demo/uiuc/reviews.json` | Fictional `RawReview[]` generated from a template grammar. Committed. |
| `raw/demo/uiuc/seed-hash.txt` | sha256 of the seed output; `tests/unit/seedDeterminism.test.ts` regenerates in memory and compares. Committed. |

## `processed/uiuc/` — what the site serves (SPEC 5, 6.3, 6.6)

Until the pipeline runs, this directory holds a **placeholder** derived from `tests/fixtures/`
(`meta.json` carries fixture markers in `edgeCases`). `npm run data:all` replaces it.

| File | Type | Contents |
|---|---|---|
| `school.json` | `School` | Id, names, timezone, `currentTerm`, `seatStatusAvailable`, source ids. |
| `subjects.json` | `Subject[]` | Subject codes with counts. |
| `courses.json` | `Course[]` | Catalog with course-level GPA, buckets, withdrawal rate, instructor count. |
| `professors.json` | `Professor[]` | Every reviewed or grades-only professor (fictional in demo mode). |
| `grades.json` | `GradeRow[]` | One row per (term, course, sched type, instructor) with `professorId` matched. |
| `sections.json` | `Section[]` | Current-term sections, cross-lists deduped by CRN, `professorIds` matched. |
| `reviews.json` | `Review[]` | Reviews with computed `sentiment` and `vibeTags`. |
| `match-report.json` | `MatchReport` | Every instructor string with method, score and outcome (uploaded as a CI artifact). |
| `meta.json` | `Meta` | Build time, mode, seed, `datasetHash`, terms, counts, sources, planted edge cases. |
| `rankings/<SUBJECT>.json` | `RankingsPayload` | Scored, badged, previewed professors for one subject; < 200 KB each. |
| `professors-detail.json` | `Record<slug, ProfessorDetail>` | School-wide detail per professor for `/p/<school>/<slug>`; < 2 MB. |
| `summaries.json` | `Record<professorId, ProfessorSummary>` | Claude or extractive summaries, keyed by professor id. |

`processed/uiuc-live/` has the same layout, produced by `npm run data:live`, and is never committed
(real instructors are never paired with fictional reviews: `DATA_MODE=live` with `REVIEW_SOURCE=demo`
is refused by the source registry).
