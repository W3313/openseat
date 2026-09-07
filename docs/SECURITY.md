# ProfPeek — Security

Threat model, the controls that exist today (with file paths), what is deferred and how to do it, a Vercel hardening checklist, how to report a vulnerability, and how often to re-audit. Written after the 2026-09-06 security review and fix pass; see [LEGAL.md](LEGAL.md) for legal posture and [GO_LIVE.md](GO_LIVE.md) for the product plan.

---

## 1. Threat model

ProfPeek is a statically generated Next.js 16 site plus nine read-only JSON API routes. There are no accounts, no server-side user data and no writes at runtime. The attack surface is therefore narrow, and the assets worth protecting are: the operator's LLM quota and money, the Vercel invocation quota, the integrity of what is displayed next to (eventually) real instructors' names, and any real data that must never leave a laptop.

| Attacker goal | Vector | Impact | Status |
|---|---|---|---|
| **Drain LLM cost/quota** | Hit `/api/schools/*/professors/*/summary` with `SUMMARY_ON_DEMAND=1` on; bypass CDN cache with `?x=N`; force 429 storms so in-request retry loops pin functions for minutes | Paid Anthropic spend or exhausted Groq free tier for every visitor; Hobby compute quota burn | **Closed** — shared-secret gate, budget, zero retries, 8 s timeout, in-flight dedup, `maxDuration = 10` |
| **Burn invocation quota / scrape the JSON API** | Unbounded `?subject=` / `?p=` permutations on API routes and the dynamic `/compare` page | Vercel Hobby pauses the project when the monthly cap is exceeded | **Mitigated** — per-IP sliding-window limiter, `/compare` now CDN-cacheable, `robots.txt` disallows `/api/` and `/compare/`; platform-level limiter deferred |
| **Deface via XSS / clickjacking** | Reviews and LLM output render on every page; no CSP or frame protection existed; `X-Powered-By` leaked the framework | Script injection if any renderer regressed; framing for UI redress | **Closed** — CSP, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `poweredByHeader: false` |
| **Prototype-pollution-style lookups** | Slugs like `constructor` passed the slug regex and reached `Object.prototype` via bracket lookups | Empty 200 cached for 24 h; 500s on `/compare` and the 404 page | **Closed** — `Object.hasOwn` guards, 128-char key cap, tests |
| **Cache poisoning / input echo** | 4xx responses echoed raw path input and were CDN-cached for a day | Each bogus URL filled the cache; reflected content in JSON (not exploitable in browsers, but noisy) | **Closed** — fixed error messages, 4xx cached ≤ 5 min, nosniff on every JSON response |
| **Abuse of compare / shortlist** | Shortlist lives in `localStorage`; share links carry slugs in the URL | No server state to abuse; junk slugs render an EmptyState (200, not 404) | **Accepted** — see deferred item 2 |
| **Ship real data by accident** | A local `DATA_MODE=live` build traced `data/processed/**` into the serverless bundle | Real instructor data (and possibly RMP output) in a public deployment | **Closed** — only reviewed, committed `data/processed/<school>` directories exist (the `uiuc-live` split is gone); raw downloads live under `data/raw/` (gitignored, never traced) and the RMP adapter is wired to no school |
| **Credential leakage** | RMP frontend token hard-coded in source, `.env.example` and docs; CI secrets; git author metadata | Shipping a third party's credential; supply-chain exposure | **Closed** for the token (removed; `RMP_AUTH_HEADER` required when enabled); CI has no secrets; author-email rewrite deferred |
| **Supply chain** | Floating action tags, default `GITHUB_TOKEN` permissions, caret ranges, postinstall scripts | Compromised action or dependency runs in CI | **Mitigated** — SHA-pinned actions, `permissions: contents: read`, Dependabot, `save-exact`; `ignore-scripts` deferred |
| **Reputational: fictional demo indexed as fact** | Demo professor pages had real-sounding names, indexable, with no "fictional" marker in meta description or sitemap | Search snippets attributing fabricated ratings to a name that matches a real person elsewhere | **Closed** — the fictional demo school was removed on 2026-09-06 (no fictional professor exists; ingest asserts `isFictional === false`) |

Out of scope for this model: DDoS beyond what Vercel's edge absorbs; compromise of the Vercel or GitHub account itself (use 2FA and hardware keys); insider risk (one operator).

---

## 2. Controls in place

All items below were implemented and verified in the 2026-09-06 fix pass; tests are listed where they exist.

### 2.1 Request-time model calls
- `src/lib/api/summary.ts` calls a model only when **all** hold: `SUMMARY_ON_DEMAND=1`, a provider key exists, the request's `x-profpeek-key` header equals `SUMMARY_ON_DEMAND_TOKEN` (constant-time compare via `crypto.timingSafeEqual`), and the per-instance budget allows it (5 generations/min, 100/day, then extractive with a warning). Anonymous requests always receive the extractive summary.
- `src/lib/config/env.ts`: zod `superRefine` refuses to start with `SUMMARY_ON_DEMAND=1` and no ≥ 16-char token.
- Concurrent requests for the same input share one in-flight promise; model-written results are primed into the module summary cache; fresh responses are `no-store`.
- `src/lib/ai/index.ts`, `src/lib/ai/openaiCompatible.ts`, `src/lib/ai/summarize.ts`: `maxRateLimitRetries` / `timeoutMs` options; the route passes `0` and `8000` (Claude client built with `maxRetries: 0`, manual 10 s sleep skipped). Script defaults unchanged.
- `src/app/api/schools/[school]/professors/[slug]/summary/route.ts`: `export const maxDuration = 10`.
- Tests: `tests/unit/summaryOnDemand.test.ts`, `tests/unit/envSecurity.test.ts`.

### 2.2 Rate limiting
- `src/lib/api/rateLimit.ts`: sliding window per client IP (first `x-forwarded-for` hop → `x-real-ip` → `'unknown'`), 60/min on read routes, 6/min on the summary route, 10k-key memory bound, disable switch. Applied through `withApiErrors(req, body, { rateLimit, bucket })` in `src/lib/api/handlers.ts` on all nine routes. Returns 429 with `Retry-After`, `x-ratelimit-*`, `{ error: { code: 'rate_limited' } }`, `no-store`.
- Limitation: per warm serverless instance — blunts single-source bursts only.
- Tests: `tests/unit/rateLimit.test.ts`.

### 2.3 Security headers
- `next.config.ts` `headers()` on `/(.*)`: `Content-Security-Policy` (`default-src 'self'; script-src 'self' 'unsafe-inline' [+ 'unsafe-eval' in dev only]; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, interest-cohort, payment), `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`; `poweredByHeader: false`.
- Why `'unsafe-inline'`: the statically prerendered RSC payload and chart/theme styles are inline; a nonce policy would force dynamic rendering of every page (deferred item 8). The rendered HTML has zero external script/link/img/iframe references, so the policy still blocks foreign origins, plugins, base-tag hijack, form exfiltration and framing.
- `/compare/:school` gets `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`.
- Tests: `tests/smoke/health.test.ts` (headers present, `X-Powered-By` absent, robots disallows).

### 2.4 Input handling
- Every path segment and query value is validated with strict zod patterns before any lookup: school via registry, subject `/^[A-Z]{2,5}$/`, number `/^\d{3}[A-Z]?$/`, slug `/^[a-z0-9]+(-[a-z0-9]+)*$/` max 128 (`src/lib/api/query.ts`, route files).
- `src/lib/repo/JsonRepository.ts`: `ownEntry` helper (`Object.hasOwn`) for `getProfessorBySlug` / `getSummary`; `src/components/layout/NotFoundSwitch.tsx` and `src/components/rankings/SubjectNotFound.tsx` guard `subjectsBySchool[school]`.
- `src/lib/api/respond.ts`: fixed error messages (never echo input); 4xx `public, max-age=60, s-maxage=300`; 429/5xx `no-store`; nosniff on every JSON response.
- Tests: `tests/unit/apiRoutes.test.ts` ("path safety": `../`, `%2e%2e`, `constructor`, `__proto__`, `<img onerror>`, 5,000-char inputs), `tests/unit/jsonRepository.test.ts`.

### 2.5 Data-boundary controls
- `next.config.ts` `outputFileTracingIncludes` narrowed to `./data/processed/uiuc/**` — a local live build cannot ship real data.
- No fictional adapter exists to mix with real people (the demo generator was removed 2026-09-06; ingest fails if any source hands it a fictional professor); `data/raw/<school>/` is gitignored (verified with `git check-ignore`) and no real school has a review source.
- `src/lib/sources/rmp/queries.ts` / `RmpReviewSource.ts`: no default credential; `RMP_AUTH_HEADER` is required when `RMP_ENABLED=1` (zod `superRefine`). The base64 literal is gone from the repo (grep returns 0).
- `src/app/robots.ts` disallows `/api/` and `/compare/`; `src/app/sitemap.ts` lists every professor page of the real schools (there are no fictional professors since 2026-09-06).

### 2.6 Supply chain and CI
- `.github/workflows/ci.yml`: `permissions: contents: read`; actions pinned to full commit SHAs (`actions/checkout@11d5960a… # v4.4.0`, `actions/setup-node@49933ea5… # v4.4.0`, `actions/upload-artifact@ea165f8d… # v4.6.2`); Node version from `.nvmrc` via `node-version-file`; triggers on `pull_request` (not `pull_request_target`); **no secrets configured** — `data:all` stays extractive without a key and `git diff --exit-code -- data` guards drift.
- `.github/dependabot.yml`: weekly npm and github-actions updates. `.npmrc`: `save-exact=true`, `engine-strict=true`.
- `npm audit`: 0 vulnerabilities at review time; every lockfile `resolved` URL points at registry.npmjs.org.

### 2.7 Privacy text
- `src/components/about/StaticSections.tsx`: hosting-and-logs paragraph (Vercel request logs, per-IP rate limit), AI-summaries paragraph (what is sent to Anthropic/Groq and when), and an honest description of the instructor-hash list (derived from public data, not secret).

---

## 3. Deferred items

| # | Item | Why deferred | How to do it |
|---|---|---|---|
| 1 | Remove request-time model generation entirely | The README documents the on-demand path for live mode; deleting it is a product decision. The gate + budget + zero retries close the anonymous cost surface. | Delete the `SUMMARY_ON_DEMAND` block in `src/lib/api/summary.ts`; drop the two env vars from `env.ts`, `.env.example`, README, SPEC 9.9; remove `tests/unit/summaryOnDemand.test.ts`; generate summaries only via `scripts/precompute-summaries.ts` in a `schedule`-triggered workflow with the key scoped to that job. |
| 2 | `/compare/[school]` 404 for junk slugs | Changes documented UX (SPEC 3.5: unknown slugs are dropped) and component tests; the CDN header makes junk URLs a once-per-day render. | In `src/app/compare/[school]/page.tsx` call `notFound()` when `details.length < MIN_COMPARE_PICKS && slugs.length > 0`; update SPEC 3.5 and tests; optionally 400 when `parsePicks` drops malformed items. |
| 3 | Git history exposes `wx@Williams-MacBook-Pro.local` as author of the initial commit | Force-pushing public history is destructive and owner-only. | `git config user.email <noreply address>`; `git rebase -r --root --exec 'git commit --amend --no-edit --reset-author'` (or `git filter-repo --mailmap`); `git push --force-with-lease`; enable GitHub "Keep my email addresses private". |
| 4 | Platform-level rate limiting | The in-memory limiter is per instance; real limits need Vercel Firewall (Pro) or a shared store. | `npm i @upstash/ratelimit @upstash/redis`; `new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(60, '1 m') })` inside `checkRateLimit`; or a Firewall rate-limit rule on `/api/*`. Attack Challenge Mode is the Hobby emergency switch. |
| 5 | Full privacy notice page (`/privacy`), `/terms`, footer links | Needs owner decisions: contact address, provider tier terms, removal process. | Outline in [GO_LIVE.md §7](GO_LIVE.md#7-legal-pages-outline); add `src/app/privacy/page.tsx`, link from the footer; confirm the model provider's zero-data-retention terms before enabling live mode. |
| 6 | Real instructor names in `docs/SOURCE_FACTS.md` example rows (lines 12–13, 23), `tests/unit/matching.test.ts:157-162`, `docs/architecture.md:86` | Low severity (public FOIA data); editing fixtures risks changing matching-test semantics. | Replace with `Lastname, First M` and clearly fictional surnames; rerun `npx vitest run tests/unit/matching.test.ts`. |
| 7 | `ignore-scripts=true` in `.npmrc`; Node/@types alignment (engines `>=22`, `.nvmrc` 26, `@types/node` 22.x) | Can break esbuild/unrs-resolver binary installs; version bumps belong in Dependabot PRs. | Try `ignore-scripts=true` then `npm ci && npm test && npm run build`; keep if green. Bump `@types/node` to the 26 line or set engines `>=26`. |
| 8 | Nonce-based CSP (drop `'unsafe-inline'` for `script-src`) | Requires a proxy issuing a per-request nonce → dynamic rendering of every page → loss of CDN caching on Hobby. | If the app ever goes dynamic: `src/proxy.ts` generates a nonce, passes `x-nonce`, sets `script-src 'self' 'nonce-…' 'strict-dynamic'`; recharts/GradeBar inline styles still need `style-src 'unsafe-inline'` or a hash list. |
| 9 | Error monitoring and uptime alerts | Not in the fix scope; nobody is notified today when a page breaks after a rebuild. | Sentry free tier via `@sentry/nextjs` with a tunnel route (keeps `connect-src 'self'`), PII scrubbing on; or Vercel log drain to Better Stack. UptimeRobot on `/api/health` every 5 min. |

---

## 4. Vercel deployment hardening checklist

Dashboard settings — none of these live in the repo.

- [ ] **Environment-variable scope.** `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `SUMMARY_ON_DEMAND`, `SUMMARY_ON_DEMAND_TOKEN`: **Production only**, marked *Sensitive*. Never Preview or Development — every branch push produces a public Preview URL that would otherwise inherit them.
- [ ] **`RMP_AUTH_HEADER` / `RMP_SCHOOL_ID` never set anywhere on Vercel or in CI**; real schools stay grades-only until the review-collection path in [GO_LIVE.md](GO_LIVE.md) is resolved. Use `SCHOOLS=` to restrict a deployment to a subset of the registry.
- [ ] **`NEXT_PUBLIC_SITE_URL`** set per environment (canonical URLs, sitemap, OG images).
- [ ] **Deployment Protection** → Vercel Authentication (or Password Protection on Pro) for Preview deployments.
- [ ] **Firewall.** On Hobby: keep Attack Challenge Mode ready as an emergency switch. On Pro: add a rate-limit rule on `/api/*` (e.g. 60 req/min per IP) and a rule blocking known scraper user agents if abuse appears.
- [ ] **Node version.** Project Settings → Node.js version matching `.nvmrc` (26). `package.json` engines should be tightened to `>=26` (deferred item 7).
- [ ] **Plan.** Hobby is licensed for personal, non-commercial use. Upgrade to Pro before any donation button, sponsorship or paid feature, and before enabling Firewall rate limits.
- [ ] **Git integration.** Production branch protected on GitHub (require the `ci` job); Vercel deploys only from that branch; disable "automatic deployments" for forks.
- [ ] **Logs.** Request logs record client IP, user agent, URL and timestamp for Vercel's retention window — disclosed in the privacy text. Add a log drain only to a vendor named in `/privacy`.
- [ ] **Account.** 2FA/hardware key on the Vercel and GitHub accounts; no shared passwords; move ownership to the LLC's team once it exists.
- [ ] **Domains.** Apex + `www` with the `*.vercel.app` hostname redirecting; HSTS preload only after the domain is stable.

---

## 5. Responsible disclosure

Until a dedicated mailbox exists, report vulnerabilities privately via **GitHub Security Advisories** on [W3313/profpeek](https://github.com/W3313/profpeek/security/advisories/new) ("Report a vulnerability"). Do not open a public issue for security problems.

When the domain is registered, add `security@<domain>` and publish `/.well-known/security.txt`:

```
Contact: mailto:security@<domain>
Contact: https://github.com/W3313/profpeek/security/advisories/new
Expires: <one year out, ISO 8601>
Preferred-Languages: en
Canonical: https://<domain>/.well-known/security.txt
Policy: https://<domain>/security
```

Commitments: acknowledge within 5 business days; fix or mitigate confirmed high-severity issues within 30 days; credit reporters who want it. In scope: anything served from the production domain and the repository. Out of scope: volumetric DoS, findings that require a compromised operator account, and third-party sites ProfPeek links to.

---

## 6. Re-audit cadence

| When | What |
|---|---|
| **Every PR** | CI: lint, typecheck, unit tests (incl. path-safety, rate-limit, on-demand gate, env guards), seed-diff, build, smoke test asserting security headers and robots rules. Dependabot PRs reviewed weekly. |
| **Before each registration window** (early Nov, early Apr) | Re-run `npm audit`; curl production for the header set and a 429 on the summary route; verify Vercel env scopes and Preview protection; check `/api/health`, sitemap and robots on the live domain; confirm no `/p/` demo pages are indexed (Search Console). |
| **On any change to** `src/lib/api/**`, `src/lib/ai/**`, `next.config.ts`, `src/lib/config/env.ts`, `.github/**` | Re-read the relevant section of this document; extend the tests; update the controls table. |
| **Before live mode ships** | Full re-review of §1 with real data: match-report coverage, small-cell suppression on every slice, privacy notice, provider data-retention terms, error monitoring live, corrections channel live. |
| **Before first-party reviews ship** | New threat model section for user-generated content: auth (magic link), spam/abuse, moderation queue, DMCA agent, data retention, database access controls. |
| **Quarterly** | Rotate `SUMMARY_ON_DEMAND_TOKEN` and provider keys; review Vercel logs for abuse patterns; check for new Next.js security advisories; revisit deferred items. |
| **Annually** | External review (a security-minded peer or a paid hour) of this document against the running system. |
