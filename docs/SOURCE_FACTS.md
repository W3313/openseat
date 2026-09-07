# Verified data-source facts (sampled live on 2026-09-03)

These are OBSERVED facts about the real upstream sources. Adapters must match these shapes exactly.

## 1. UIUC GPA dataset (public CSV, GitHub repo (no licence declared; the grades are Illinois public records))
URL: https://raw.githubusercontent.com/wadefagen/datasets/main/gpa/uiuc-gpa-dataset.csv
Size: ~8.8 MB, ~79,900 rows, 177 subjects, ~10,500 distinct instructor strings. Terms 2010 -> 2026-wi.

Header (exact):
Year,Term,YearTerm,Subject,Number,Course Title,Sched Type,A+,A,A-,B+,B,B-,C+,C,C-,D+,D,D-,F,W,Students,Primary Instructor

Example rows:
2025,Fall,2025-fa,CS,225,Data Structures,LEC,130,350,110,62,87,47,28,39,19,18,13,7,11,6,921,"Solomon, Brad R"
2025,Spring,2025-sp,CS,225,Data Structures,LBD,9,45,30,10,6,1,4,2,0,1,0,0,1,0,109,"Kindratenko, Volodymyr"

Facts:
- One row = one (term, course, sched type, primary instructor) aggregate, NOT one CRN/section. `Students` = sum of letter grades + W.
- YearTerm codes: `2025-fa`, `2025-sp`, `2025-su`, `2025-wi`. Term words: Fall/Spring/Summer/Winter.
- Sched Type values (freq order): LCD, LEC, '' (empty, ~10k rows), ONL, DIS, LAB, OLC, LBD, Q, OD, OLB, CNF, PR, ST, PKG, Onl, INT, SEM, Int, RES. Treat case-insensitively; empty = unknown.
- `Primary Instructor` format: "Last, First M" (middle initial optional, no period). 185 rows have EMPTY instructor -> keep for course averages, never attach to a professor.
- Name edge cases present in data: apostrophes ("O'Brien, William D"), hyphens in last ("Bigman-Galimore, Cabral A") and first ("Kirr, Eduard-Wilhelm"), multi-word last names ("Van Heuvelen, Thomas A", "Morales Perez, Gerson", "Srimath Tirumala, H"), first-name-only-initial ("Elliott, W B"), lowercase second part ("Chang, Hua-hua").
- GPA convention (used by the dataset author and UIUC): A+=4.0, A=4.0, A-=3.67, B+=3.33, B=3.0, B-=2.67, C+=2.33, C=2.0, C-=1.67, D+=1.33, D=1.0, D-=0.67, F=0. W excluded from GPA denominator but reported separately as withdrawal rate.
- Small-sample suppression: upstream already suppresses very small sections; we should still hide/mark stats when n < 10 students.

## 2. UIUC Course Explorer (public XML REST API, no auth)
Base: https://courses.illinois.edu/cisapp/explorer/schedule
- `/schedule.xml` -> calendar years. `/schedule/2026.xml` -> terms. `/schedule/2026/fall.xml` -> `<subjects><subject id="CS" href=...>Computer Science</subject>...`
- `/schedule/2026/fall/CS.xml` -> `<courses><course id="225" href=...>Data Structures</course>...` (CS Fall 2026 has ~150 courses)
- `/schedule/2026/fall/CS/225.xml` -> course: `<label>`, `<description>`, `<creditHours>`, `<sections><section id="65054" href=...>ABA</section>...>`
- `/schedule/2026/fall/CS/225.xml?mode=cascade` -> SAME plus `<detailedSections><detailedSection id="65054">` each with:
    <sectionNumber>AL1</sectionNumber>
    <statusCode>A</statusCode>            <!-- A = active. Other codes seen historically: P (pending), X (cancelled) -->
    <partOfTerm>1</partOfTerm>
    <sectionStatusCode>A</sectionStatusCode>
    <startDate>08-24-26Z</startDate><endDate>12-09-26Z</endDate>
    <meetings><meeting id="0">
      <start>11:00AM</start><end>11:50AM</end>
      <daysOfTheWeek>MWF</daysOfTheWeek>   <!-- letters M T W R F S U; may be absent for ARRANGED/online -->
      <roomNumber>AUD</roomNumber><buildingName>Foellinger Auditorium</buildingName>
      <type code="LEC">Lecture</type>      <!-- codes: LEC, LBD, DIS, LAB, ONL, LCD, ... same vocabulary as GPA CSV Sched Type -->
      <instructors>
        <instructor lastName="Koe" firstName="K">Koe, K</instructor>
        <instructor lastName=" Solomon" firstName="B"> Solomon, B</instructor>   <!-- NOTE leading space bug on 2nd+ instructors: TRIM -->
      </instructors>                       <!-- may be <instructors/> (empty) -->
    </meeting></meetings>
- Instructor names in the schedule API are "Last, F" (FIRST INITIAL ONLY). Joining schedule -> GPA dataset needs (last name + first initial) matching, scoped to the same course to disambiguate.
- **There is NO enrollmentStatus / seat-count element in any current response** (checked default, detail and cascade modes for Fall 2026, Spring 2026, Fall 2025). Only `statusCode`/`sectionStatusCode`. Therefore for the real UIUC adapter:
    status 'A' -> SectionStatus 'offered' (active this term), seats: unknown
    anything else -> 'inactive'
  The UI must label real-source sections as "Offered this term" and state that live seat availability is not exposed by the public API; the UH Class Browser source carries open/closed/waitlist seat status, so the "open sections" filter is live there.
- Sections whose meeting type is LBD/DIS/LAB with `<instructors/>` empty are TA-led; attribute the course to the LEC/LCD/ONL primary instructor.
- Be polite: ~150 course requests per subject per term with cascade mode; add concurrency limit (4) and a 100ms delay; cache raw XML in data/raw/uiuc/{year}-{term}/{SUBJECT}/*.xml (gitignored).

## 3. RateMyProfessors (unofficial, behind env flag, user's responsibility)
- Endpoint: POST https://www.ratemyprofessors.com/graphql with an `Authorization: Basic …` header (the site's own frontend token; widely documented in open-source clients — deliberately not reproduced here or shipped in this repo: the operator supplies it via `RMP_AUTH_HEADER`, which is required when `RMP_ENABLED=1`). May break at any time; adapter must fail soft (return [] and log) never crash ingestion.
- School lookup: query `newSearch { schools(query: {text: $text}) { edges { node { id name city state } } } }` — UIUC's id is commonly "U2Nob29sLTExMTI=" (base64 of "School-1112"); do NOT hardcode as truth, look it up and allow override via env RMP_SCHOOL_ID.
- Teacher search: query `newSearch { teachers(query: {text: $text, schoolID: $schoolID}) { edges { node { id legacyId firstName lastName department avgRating avgDifficulty numRatings wouldTakeAgainPercent } } } }`
- Ratings for a teacher: `node(id: $id) { ... on Teacher { ratings(first: $count) { edges { node { id legacyId class comment date helpfulRating clarityRating difficultyRating grade wouldTakeAgain thumbsUpTotal thumbsDownTotal ratingTags } } } } }`
- Name format: firstName / lastName separate, full first name ("Brad" not "B"). Department string e.g. "Computer Science".
- Reviews carry `class` like "CS225" or "CS 225" (free text!) -> normalize by stripping spaces/uppercasing to match course codes.

## 4. Toolchain facts (this machine / this scaffold)
- Node v26.8.1, npm 11.19. Next.js 16.3.4 (App Router, `src/` dir, `@/*` alias, Turbopack), React 19.2, Tailwind CSS v4 (CSS-first config via `@import "tailwindcss"` + `@theme inline` in globals.css — there is NO tailwind.config.js; do not create one), ESLint 9 flat config (`eslint.config.mjs` using eslint-config-next core-web-vitals + typescript). TypeScript 5 strict.
- Installed deps: @anthropic-ai/sdk, zod, csv-parse, fast-xml-parser, recharts, clsx, lucide-react. Dev: vitest 5, tsx, @types/node 22.
- Next 16 notes: `params` and `searchParams` in page components are Promises (must `await`). Route handlers: `export async function GET(req: Request, ctx: { params: Promise<{...}> })`. `next/image` unchanged. Server Components by default; add `"use client"` for recharts/interactive components. `next.config.ts` is TypeScript.
- Anthropic SDK: `import Anthropic from "@anthropic-ai/sdk"`; `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`; `client.messages.parse({ model, max_tokens, messages, output_config: { format: zodOutputFormat(Schema) } })` -> `response.parsed_output`. Default model string: "claude-opus-5" (configurable via env ANTHROPIC_MODEL). Check `response.stop_reason === "refusal"` before using output. Never call the SDK from client components; server-only route handler.

## 5. Verified library versions and gotchas (installed in the scaffold, 2026-09-04)
- @anthropic-ai/sdk 0.123.0 — `import Anthropic from "@anthropic-ai/sdk"`; `import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"` (verified: returns `{type:"json_schema", schema:{...}}`). `Anthropic.APIError`, `Anthropic.RateLimitError`, `Anthropic.AuthenticationError` exist as static classes. Do NOT `require("@anthropic-ai/sdk/package.json")` — subpath not exported.
- zod 4.5.4 (v4 API: `z.object`, `z.enum`, `z.array`, `.min/.max`, `z.infer` all fine; `zodOutputFormat` accepts zod 4 schemas — verified).
- fast-xml-parser 5.11.1 — `import { XMLParser } from "fast-xml-parser"`. Use `new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => ["section","detailedSection","meeting","instructor","course","subject"].includes(name) })`. WITHOUT isArray, a single child element parses to an OBJECT not a one-element array (verified) — this is the #1 bug source. Text of an element with attributes lands in `"#text"`. Default trimValues:true already trims the leading-space instructor bug, but trim again defensively.
- csv-parse 7.0.2 — `import { parse } from "csv-parse/sync"`; `parse(text, { columns: true, skip_empty_lines: true })` returns `Record<string,string>[]` (verified). For the 8.5MB file sync parse is fine (<1s).
- recharts 3.10.1 (React 19 OK) — client components only ("use client"). Prefer hand-rolled SVG for GradeBar/Sparkline (smaller bundle, SSR-safe); recharts optional for the detail-page GPA trend.
- lucide-react 1.40.0, clsx.
- Tests: vitest 5.0.0 + @testing-library/react 16.3.3 + jsdom 30 + @vitejs/plugin-react installed. vitest.config.ts includes `**/*.test.ts` and `**/*.test.tsx` under src/, scripts/, tests/; default environment node; component tests must start with the docblock `// @vitest-environment jsdom`. Alias `@/` -> `src/`.
- Scripts: `npm run dev|build|start|lint|typecheck|test`. tsx 4.23 for `scripts/*.ts` (`npx tsx scripts/foo.ts`).
- next.config.ts: to make `data/processed/**` readable at runtime on Vercel, set `outputFileTracingIncludes: { "/**": ["./data/processed/**/*"] }` (key verified present in Next 16.3.4 config types). Prefer reading JSON via `fs.readFile(path.join(process.cwd(), "data/processed", ...))` inside server code with an in-memory cache.
