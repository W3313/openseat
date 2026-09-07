# ProfPeek — Go-live plan

The plan for turning the portfolio demo into a marketable product, built on the legal research in [LEGAL.md](LEGAL.md) and the controls in [SECURITY.md](SECURITY.md). Legal statements here summarise those notes; **this is research, not legal advice** — see LEGAL.md §6 for the lawyer checklist.

---

## 1. Positioning

**"The grade-curve-first section picker for UIUC."** The only place that puts the official, FOIA-released grade distribution each instructor actually gave — compared leave-one-out against the same course taught by others — next to the sections offered this term, with a published methodology and a per-instructor correction channel.

Lead with what is lawful, defensible and unique: **official grades × this-term schedule × transparent matching.** Reviews are a layer ProfPeek will collect itself, not borrow.

**Do not position as "RateMyProfessors plus grades" and do not ingest RMP data into the public site.** All three legal threads converge: express scraping and commercial-use bans, student-owned review text, an unofficial token-gated endpoint, New York venue with fee-shifting. A product whose core feed can vanish on one letter is not marketable and is a diligence blocker. Link out with plain-text "RateMyProfessors (not affiliated)" instead.

| Competitor | Has grades | Has reviews | Has schedule join | Model |
|---|---|---|---|---|
| RateMyProfessors | no | yes (UGC, no API) | no | ads (Archetype-owned since 2023) |
| UIUC grade visualizations (Fagen-Ulmschneider) | yes | no | no | free, faculty-hosted |
| Coursicle | no | no | yes (1,000+ schools) | freemium seat alerts ($3–5/semester) |
| Berkeleytime / Madgrades / TAMU sites | yes | no | partial | free student projects, single campus |
| **ProfPeek** | **yes** | **first-party (later)** | **yes** | free → alerts/sponsorships |

**Honest caveats that shape the launch**
1. ~~Live mode has never run against the real endpoints, and the deploy path ships only the fictional demo.~~ Resolved 2026-09-06: UIUC, Purdue and Houston ship real data and the fictional demo school was removed. "Launch" still means hardening the real-data publish path, not flipping an env var.
2. With `REVIEW_SOURCE=none` the default sort (shrunk rating) is empty and every instructor falls into "Not enough reviews." The UI must default to a grades-based ranking until first-party reviews exist.
3. AI summaries are dormant at launch (nothing to summarise). That is a feature until the summary design is hardened for real names (LEGAL.md §4.3).
4. "ProfPeek" collides with the existing "Professor Peek" Cornell extension. Decide before printing anything.

**Audience and channel.** UIUC undergraduates during the two registration windows (early November, early April), via r/UIUC, department Discords, the Illinois Student Council (which drove Senate item EP.25.072), and a Daily Illini pitch. Universities are a data source and distribution partner in year one, not a customer.

---

## 2. MUST before launch

| # | Item | Why | Effort |
|---|---|---|---|
| M1 | **Adopt and publish the data-source policy.** Production = real UIUC grades (public records) + Course Explorer schedule; `REVIEW_SOURCE=none`; `RMP_ENABLED` never set on Vercel or CI; RMP adapter documented as local-only research tool; add a plain-text RMP link-out. Record in `docs/SOURCE_FACTS.md` and `/about#sources`. | Every legal thread rates public RMP ingestion high-risk/blocker. Deciding first settles what the launch UI looks like. | Decision 1 h; edits 3–4 h |
| M2 | **Build the real-data publish path and run live mode end to end.** `npm run data:live` for launch subjects; verify match-report coverage on real names; make live output deployable (scheduled GitHub Action → commit `data/processed` to a `data-live` branch or private data repo → Vercel deploy with `DATA_MODE=live` and tracing for that directory in production only). Rebuild weekly, daily in registration weeks. | ~~`data/processed/uiuc-live` is gitignored and excluded from tracing; the deployed site can only serve the demo today.~~ Since 2026-09-06 `data/processed/{uiuc,purdue,uh}` are committed real datasets and the demo is gone; what remains is the scheduled refresh. | 1–2 weeks |
| M3 | **Reposition the UI for reviews-less real data.** Default sort "Grades" (delta vs course → GPA → students graded) when a subject has zero reviews; hide RatingBlock/ConfidenceDots/quotes/AI panel when `reviewCount === 0`; drop the "Not enough reviews" grouping in that state; retitle pages and landing copy, StatsStrip, OG image, metadata. | SPEC F2/F8 rank by shrunk rating; on real data with no reviews the page would be empty. | 3–5 days incl. tests |
| M4 | **Extend small-cell suppression to every displayed slice.** `MIN_GRADED_N=10` on per-year points, per-course rows, W/DFW rates, badge inputs; collapse histogram buckets when any bucket < 3 in a single-section/term view; document at `/about#privacy`. Show match tier + confidence on every real-instructor page; default sub-T2 (< 0.95) schedule matches to grades-only entries. | Upstream suppresses ≤ 20 but ProfPeek's sub-aggregates can fall below its own floor; a mis-joined name is ProfPeek's own false statement with no Section 230 cover. | 2–3 days |
| M5 | **Correct the false MIT licence claim** in README (table + provenance), `docs/SPEC.md`, `docs/SOURCE_FACTS.md`, `docs/architecture.md`, `DataProvenance.tsx`, `SourcesSection.tsx`, `LicensingSection`, and `license: 'MIT'` in `UiucGpaCsvSource.ts` → "Illinois public records (FOIA; UIUC Senate EP.25.072) curated by Wade Fagen-Ulmschneider; no licence declared." Ask the maintainer to add a licence; file ProfPeek's own FOIA request (foia@uillinois.edu). | The repo declares no licence. A false licence on a marketed product is a credibility and diligence problem. | Edits 1–2 h; FOIA 1 h + 5–10 business days |
| M6 | **Ship `/privacy`, `/terms`, `/accessibility`** (outline in §6) linked from the footer, each with an effective date. Update `/about#privacy` once analytics ships. | CalOPPA requires a conspicuous privacy policy the moment any PI (IP logs, a contact email) is collected from a California visitor; Terms carry disclaimers and the correction process; Illinois is the #3 venue for web-accessibility suits. | 1–2 days; one-hour clinic review before charging money |
| M7 | **Contact, corrections and abuse channel.** `hello@` and `corrections@` on the domain; `/contact`; "Report a data error" link on every real-instructor page (prefilled mailto or issue template with the slug); acknowledge within 5 business days; internal runbook (verify against source → fix via `data/overrides/uiuc-instructor-aliases.json` or suppression list → rebuild → reply). | Instructors will find their page. A working correction path is the cheapest defamation/goodwill mitigation and what the university will ask about. | ½ day; 1–2 h/week in registration windows |
| M8 | **Privacy-preserving analytics, no banner.** Vercel Web Analytics (cookieless) or self-hosted Umami/Plausible; disclose in `/privacy`; no GA or ad pixels; CalOPPA DNT statement. | Can't run a product blind; cookieless aggregate analytics needs no US consent banner. | 1–2 h |
| M9 | **Error monitoring.** Sentry free tier via `@sentry/nextjs` with a tunnel route (keeps CSP `connect-src 'self'`), PII scrubbing, source maps from CI; alert on 5xx rate and `/api/health`. | `error.tsx` only console-logs a digest; silent breakage in registration week loses the first cohort. | ½ day |
| M10 | **Uptime monitoring + status page.** UptimeRobot / Better Stack free tier on `/api/health` every 5 min; link from `/contact`. | Free, minutes, answers "is it down?" | 30 min |
| M11 | **Register domains now** (profpeek.com/.app were unregistered 2026-09-06; also the rename candidate); apex + www on Vercel; `NEXT_PUBLIC_SITE_URL`; keep `*.vercel.app` as redirect. | Canonicals, sitemap, OG and mailboxes key off the domain; `*.vercel.app` signals side project. | 30 min; $12–20/yr each |
| M12 | **Brand decision.** Run the free USPTO search (classes 9/41/42). Either (a) keep ProfPeek with a written coexistence/assignment letter from the Professor Peek author, or (b) rename before any marketing — **ProfCurve** fits; SectionSage and ProfDelta also clear — and optionally file a $350 ITU. Default if no reply in two weeks: rename to ProfCurve. | Near-identical marks for the same service; every marketing hour under a name you may abandon is wasted. | 2–4 h + ≤ 2 weeks waiting; rename touches wordmark, titles, README, localStorage prefixes (keep old keys readable), repo slug |
| M13 | **Vercel plan and lockdown.** Hobby is fine for a free, ad-free, donation-free launch; plan Pro ($20/mo) before any sponsorship, paid feature or donation button, and when Firewall rate limits are needed. Enable Deployment Protection on Previews now. | Vercel's fair-use policy is the one platform term you are bound by; Previews could leak a live-data build. | 15 min now |
| M14 | **Accessibility pass + statement.** axe and Lighthouse on landing, rankings, course, detail, about in light and dark; fix critical/serious; publish `/accessibility` (target, tested pages, date, known issues, contact); add an axe check to CI against the built site. | Public universities push WCAG 2.1 AA to anything they link (DOJ Title II by Apr 2027; Illinois IITAA 2.1); the statement doubles as a partnership asset. | ½–1 day |

---

## 3. SHOULD within the first month

| # | Item | Why | Effort |
|---|---|---|---|
| S1 | **Design and start first-party reviews.** Verified UIUC students via @illinois.edu magic link (store salted hash + domain only); structured fields + free text under published guidelines; flag button; removal-only moderation; verified professor replies; Postgres (Neon/Vercel Postgres free tier) behind the existing `Repository` interface. Cold start: "Request reviews" counters, CS/ECE first, launch two weeks before November registration. | The only lawful path to the review signal; puts hosted reviews under Section 230(c)(1) and DMCA 512(c); the one asset competitors cannot copy. Expect a slow cold start. | 3–6 weeks; schema this month |
| S2 | **Form an Illinois LLC** (~$150 + ~$75/yr), separate bank account, media-liability insurance quotes; move domain, Vercel and mailboxes under it before the first user review or dollar. | Rankings, badges and summaries are first-party speech about named people; today claims land on the founder personally. | 2–3 h + $150 |
| S3 | **Register a DMCA designated agent** ($6, renew every 3 yrs); publish on `/terms`; write notice/counter-notice (10–14 business-day put-back) and repeat-infringer procedures — before reviews go live. | Section 230(e)(2) excludes IP; without 512(c) compliance there is no safe harbor when a student pastes an RMP review or syllabus. | 1–2 h + $6 |
| S4 | **Send three emails and keep the replies:** (1) UIUC Registrar / Technology Services — acknowledgement that Course Explorer data may be used with attribution, whether an official or seat feed exists, acceptable rate; (2) Illinois Student Council + Senate EP committee — introduce ProfPeek as a neutral, open-methodology consumer of the data they released; (3) CITL — status and terms of the "Teachers Ranked as Excellent" list. Add a descriptive User-Agent with contact address to `CourseExplorerSource` (none today); cache per term. | Universities have withdrawn this kind of data before (Cornell 2011, Yale 2014, MSU 2024–26). A paper trail of good faith is cheap insurance and the start of the partnership pitch. | ½ day; UA change 30 min |
| S5 | **Harden AI summaries for real names** before re-enabling on live data: rename "verdict" → "What students say"; adjacent "AI-generated summary of N reviews; may contain errors" label; attribution phrasing + post-generation validator; banned-topic list in prompt/schema/post-filter; minimum 5 reviews; always surface a watch-out when critical reviews exist; auto-unpublish on input removal; keep `SUMMARY_ON_DEMAND` off in production; log prompt version/model/inputs; instructor opt-out. | Section 230 almost certainly does not cover generated summaries; most professors are private figures; Tripadvisor's Which? episode shows how skewed summaries become a story. | 3–5 days once reviews exist; validator/labelling now |
| S6 | **Automate data refresh + freshness display.** Scheduled Action (weekly; daily in registration weeks) fetches CSV + schedule, rebuilds, diffs coverage vs previous build (fail if coverage drops > 5 pts or ambiguous strings spike), publishes, deploys. `/data-freshness` page with snapshot times. | Students need hours-old schedule data during add/drop; a coverage-diff gate stops a bad upstream change from shipping wrong joins. | 2–3 days |
| S7 | **Instructor-facing pages.** `/for-instructors`: sources, methodology, suppression, correction process, what will/won't be removed, future AI opt-out. "Data sources for this page" line under each real-instructor header linking to exact CSV rows and Course Explorer URLs. | Faculty backlash is the main threat to continued university cooperation (the Senate endorsement is conditional). | 1 day |
| S8 | **Campus launch.** r/UIUC and department Discords the week registration opens; Daily Illini pitch; ask Wade Fagen-Ulmschneider to list ProfPeek among dataset users; 3–5 volunteer testers per department; one-question in-page feedback ("Did this help you pick a section?") as an analytics event, no PII. | Distribution at zero budget is timing plus community; the product matters ~4 weeks a year. | 2–3 days across the window |
| S9 | **Test monetisation demand without payments.** Email waitlist for "section alerts" (CAN-SPAM: postal address, one-click unsubscribe, transactional-only sends) and a donation link once on Pro; track signups per subject. | Coursicle proves students pay a few dollars for seat alerts; UIUC's API exposes no seats, so the waitlist measures demand and strengthens the Registrar ask. | ½ day + Pro |
| S10 | **Draft the multi-school public-records programme.** Template request; per-school `MIN_GRADED_N = max(10, school threshold)`; adapter checklist; targets by ease: registrars already publishing (Texas A&M, UW-Madison, UT Austin) → Illinois publics via FOIA (UIC, Illinois State, NIU); skip login-gated sources (Cal Answers) and private universities. | A second school is the credibility step from project to product; choosing proactive publishers avoids fights and scraping. | 2 days now; 1–2 weeks per adapter later |
| S11 | **Shared rate-limit store** (Upstash Redis free tier via `@upstash/ratelimit`, call sites unchanged) or Vercel Firewall on Pro; audit API cache headers. | The in-memory limiter is per instance and cannot stop distributed abuse of the free JSON API. | 2–3 h |
| S12 | **WCAG-edition VPAT/ACR** from the free ITI template, kept with the accessibility statement. | First document a university IT/advising office asks for before linking a third-party tool. | ½ day |

---

## 4. Data strategy

**Principle:** use only data ProfPeek is entitled to hold, in this order of preference — public records ProfPeek requested itself → data a registrar publishes proactively → reviews collected on ProfPeek under its own terms → **never** scraped third-party UGC.

1. **Grades (now).** Bootstrap from the UIUC GPA dataset; file ProfPeek's own FOIA request so chain of title runs UIUC → ProfPeek and per-term files can be diffed; confirm the EP.25.072 release channel and suppression rule. Apply `MIN_GRADED_N=10` to every slice and collapse small buckets. Attribute UIUC and the curator; stop claiming MIT.
2. **Schedule (now).** Course Explorer XML with polite, identified fetching (descriptive User-Agent with contact email, concurrency 4, 100 ms delay, per-term cache, weekly rebuilds); written request to the Registrar for acknowledgement and a seat feed. Keep a fallback adapter (the `course-catalog` files in wadefagen/datasets or a manual CSV) so a shutoff degrades to "grades only."
3. **Reviews, first-party (the strategic asset).** Verified students, structured fields + free text, published guidelines. Section 230 posture: host, rank, display — never write, edit or sharpen (*Jones v. Dirty World*); removal-only moderation; flag button; documented notice-and-response; verified professor replies; minimal poster metadata under a published retention policy; repeat-infringer policy + DMCA agent; explicit no-reposting rule. Operations: automated pre-checks (profanity, contact info, accusation patterns), human review of flags within 48 h, appeals mailbox, quarterly transparency line on `/about`. Never solicit, seed or auto-generate reviews (FTC review rule). Cold start: CS/ECE first, launch two weeks before registration, and keep the grades-first product useful with zero reviews.
4. **University evaluation data.** Only what is affirmatively public: the "List of Teachers Ranked as Excellent" (public PDF; CSV archive 1993–2019) can become a factual badge with a link; ask CITL about a successor after ICES retirement. Never gated per-question scores; never anything behind a NetID.
5. **Public-records programme for more schools.** Template request (aggregate distributions by term, course, section type, primary instructor, with the institution's own suppression); target registrars already publishing first, then Illinois publics under FOIA, then strong public-records states; per-school floor `max(10, own threshold)`; skip private universities and login-gated warehouses.
6. **Partnership pitch — students first, administrators second.** To the Illinois Student Council and Senate EP committee: "you released this data; here is a neutral, open-source, methodology-transparent tool with stricter suppression than required, a correction process, and no ads next to instructor names." To the Registrar: acknowledgement, a seat feed, an official data drop — not procurement. To advising offices and CITL: a link, not a contract. Defer HECVAT/VPAT/FERPA school-official contracts until a second campus and review volume exist.
7. **RateMyProfessors.** Link out only; plain-text nominative attribution with "not affiliated"; no logo; no ingestion in production. Any licence conversation is with Rate My Professors, LLC (Archetype) in writing; until then the adapter stays local-only and off by default.

---

## 5. Monetisation (ranked by realism)

| # | Model | Realism | Notes |
|---|---|---|---|
| 1 | **Free + donations** (GitHub Sponsors, Ko-fi footer link) once on Vercel Pro | Immediate | Covers domain + hosting (~$250/yr); keeps the partnership pitch clean. Tens of dollars a month. |
| 2 | **Paid section/seat alerts** at $3–5/semester (Coursicle model) | High as a model, **blocked** until an official seat feed exists | Run the email waitlist now; use it in the Registrar ask; year-two revenue line. |
| 3 | **Fixed-price campus sponsorships** (tutoring, textbook exchange, housing, events) on landing/subject pages | Moderate — a few hundred dollars per registration window once traffic is real | Never on instructor pages, never keyed to a name, never programmatic; paid placement can never affect rankings or content (jameda lesson, FTC rule). Requires Pro + privacy update. **Avoid AdSense** (degrades product, EU consent, RMP owns the cluttered position). |
| 4 | **Premium convenience** (schedule-fit presets, pinned comparisons, cross-device sync, exports) | Low–moderate | Small willingness to pay; cheap to test alongside alerts. |
| 5 | **Department / advising licensing** (dashboards, widgets, reports) | Low in year one | Coursicle's college sales "stagnated"; needs HECVAT, VPAT, FERPA school-official terms. Revisit after a second campus. |
| 6 | **Data or API licensing** | Unrealistic | Grades are public records; rankings and summaries are not copyrightable. |

**Never:** selling or sharing user data; per-professor paid features (right-of-publicity exposure); ads on instructor pages; any scraped-RMP-backed feature.

---

## 6. Metrics to track

- Registration-window weekly actives (cookieless) and landing → rankings conversion
- Subject page → card expand rate; card → profile click-through
- Shortlist adds per session; compare-page usage (client-side counts, no identifiers)
- Course-filter usage; share of sessions toggling "Offered this term" off
- **Data freshness:** hours since schedule snapshot; terms since grades-through term — surfaced and alerted
- **Match quality per build:** coverage %, ambiguous, unmatched, grades-only entries created — diffed against previous build, fail on regression
- **Corrections:** requests received, median time to first response and resolution, suppressions/aliases applied
- **Reliability:** uptime from `/api/health`, 5xx rate, error events per 1k requests, API 429 rate
- **Performance:** p75 LCP and CLS on `/s/uiuc/CS` and a detail page; JS bytes (< 150 KB gzipped)
- **Search:** indexed subject/course/professor pages; organic entrances by page type
- Once reviews exist: verified reviewers/week, reviews-per-professor distribution, flag rate, queue time, professor replies, AI-label impressions and opt-outs
- Monetisation signals: alert-waitlist signups per subject, donations, sponsor inquiries
- Upstream health: Course Explorer fetch failures per rebuild; GPA CSV schema-check passes
- Qualitative: "Did this help you pick a section?" yes/no rate; contact-mailbox feedback volume

---

## 7. Legal pages outline

**`/privacy`** — 1 who runs it and how to reach us (LLC name once formed; `hello@`, `corrections@`; postal address if email is ever sent) · 2 plain-English summary (no accounts, no cookies, no ads, no data sale; shortlist stays in your browser; we publish public-records data about instructors, not about you) · 3 browser storage: `profpeek:v1:school`, `profpeek:v1:picks`, never transmitted, how to clear, private-mode fallback · 4 server logs: Vercel request logs (IP, UA, URL, referrer, timestamp; short retention; operate-and-secure only); in-memory per-IP rate limit; error monitoring vendor with IP scrubbing · 5 analytics: cookieless aggregate vendor; DNT/GPC statement (CalOPPA) · 6 information you send us: contact/correction emails; alert-waitlist addresses (purpose, unsubscribe, retention) · 7 **information about instructors**: sources, what is derived and that derived figures are ProfPeek's analysis, suppression rules, correction process, what will/won't be removed, AI-summary opt-out · 8 AI-generated content: produced offline; the public site calls no model for visitors; on-demand generation sends only name, department, aggregates and selected review text to Anthropic/Groq, never viewer data · 9 service providers (Vercel, GitHub, analytics, error monitoring, model providers; no brokers or advertisers) · 10 children (general-audience, not directed to under-13) · 11 choices and rights (below CCPA/CPRA thresholds but honours reasonable requests; US-only scope) · 12 security (HTTPS/HSTS, CSP, read-only deployment, no user store) · 13 changes and effective date.

**`/terms`** — 1 acceptance and eligibility (13+, US) · 2 what ProfPeek is and is not (independent; not affiliated with any university; not advising; rankings/deltas/badges/summaries are derived analyses and opinions from published formulas; confirm with the registrar) · 3 data sources and attribution (Illinois public records; Course Explorer; rules at `/about`; not an official record) · 4 acceptable use (personal, non-commercial use of site and read-only API within published rate limits; no abusive automation, bulk redistribution as official data, misrepresentation, or bypassing limits/headers) · 5 licences (code MIT; derived real-data outputs reusable with attribution under a stated licence, e.g. CC BY 4.0; ProfPeek name is ours; RateMyProfessors is its owner's mark, referenced only to identify an unaffiliated site) · 6 corrections and disputes (how to report, 5-business-day acknowledgement, what we correct, suppressions/aliases, AI opt-out) · 7 AI-generated content (labelled; may contain errors; a summary of student reviews, not a statement of fact by ProfPeek) · 8 user content (activate with reviews: you retain ownership and grant a worldwide, non-exclusive, royalty-free, sublicensable licence to host, display, analyse and summarise; warranties; guidelines; removal-only moderation; professor replies; DMCA agent, notice/counter-notice, repeat-infringer) · 9 disclaimer of warranties · 10 limitation of liability (greater of prior-12-month payments or $50) · 11 indemnity for user content only · 12 Illinois law, Champaign County venue, 30-day informal step, no arbitration for now · 13 changes, termination, severability, contact, effective date.

**`/accessibility`** — WCAG 2.1 AA target; pages and tools tested (axe, Lighthouse, keyboard and screen-reader spot checks, light and dark) and date; known issues and planned fixes; how to report a barrier and response target; compatibility notes (native details/summary, `role="img"` charts with hidden tables, colour-blind-safe palette).

Have the drafts reviewed once by a law-school clinic or an Illinois media/Internet lawyer before charging money or launching user reviews.

---

## 8. Week 1 checklist

Print this page. Everything here is doable by one person in five working days, and nothing requires a lawyer yet.

**Day 1 — decisions and paperwork (≈ 3 h)**
- [ ] Write the data-source policy (M1): grades + schedule in production, `REVIEW_SOURCE=none`, RMP local-only with link-out. Commit it to `docs/SOURCE_FACTS.md`.
- [ ] Run the USPTO search for PEEK-formative marks in classes 9/41/42 (M12). Email the Professor Peek author asking for a coexistence letter; set a two-week timer; default to ProfCurve.
- [ ] Register profpeek.com/.app **and** profcurve.com/.app (M11). Set up `hello@` and `corrections@` forwarding.
- [ ] Vercel: Preview Deployment Protection on; confirm `DATA_MODE` and `RMP_ENABLED` unset everywhere; secrets Production-only and Sensitive (M13; SECURITY.md §4).
- [ ] File the FOIA request for the grade data with foia@uillinois.edu (M5). Open the licence issue on wadefagen/datasets.

**Day 2 — truth in docs (≈ 4 h)**
- [ ] Fix the MIT claim in all eight locations (M5); change `license: 'MIT'` in `UiucGpaCsvSource.ts`; run tests.
- [ ] Add a descriptive User-Agent with contact email to `CourseExplorerSource` (S4).
- [ ] Draft the three university emails (S4) and send them.

**Day 3 — run live mode for real (full day)**
- [ ] `cp .env.example .env.local`; `DATA_MODE=live REVIEW_SOURCE=none SUBJECTS=CS,ECE npm run data:live` (M2).
- [ ] Read `match-report.json`: coverage, ambiguous, unmatched. Note every real-data parser edge case in an issue.
- [ ] List every UI surface that renders wrong or empty with zero reviews (input to M3).

**Day 4 — observability and pages (≈ 5 h)**
- [ ] Vercel Web Analytics or Umami (M8); Sentry with tunnel route (M9); UptimeRobot on `/api/health` (M10).
- [ ] Draft `/privacy`, `/terms`, `/accessibility` from §7 (M6); `/contact` with the mailboxes (M7); footer links.
- [ ] Run axe + Lighthouse on five pages, both themes; log findings (M14).

**Day 5 — plan the build weeks**
- [ ] Break M2 (publish path), M3 (reviews-less UI) and M4 (suppression on every slice) into issues with the estimates above.
- [ ] Schedule the S1 first-party review design session; pick Postgres provider.
- [ ] Book the one-hour law-clinic slot for two weeks out with [LEGAL.md §6](LEGAL.md#6-questions-for-a-lawyer-bring-this-list) printed.
- [ ] Put the November registration window on the calendar with a two-week-earlier soft-launch date.
