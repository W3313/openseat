# LinkedIn post draft

Fill in `{link}` with the live demo URL (and optionally the repo URL) before posting. ~900 characters.

---

I built ProfPeek — a small full-stack project that answers the question every student asks during registration: *which professor should I actually take?*

It joins a public university grade dataset (per-course, per-instructor GPA distributions) with student reviews and this term's schedule, then ranks professors in a subject by a shrinkage-adjusted rating, shows the grade curve each one actually gave compared with the same course taught by others, and adds a Claude-generated structured summary (with a deterministic fallback so the demo works with zero API keys).

The part I'm proudest of is the boring part: a provenance-tracked fuzzy name matcher ("Last, F" ↔ "First Last", hyphens, diacritics, nicknames, ambiguity → no match), Bayesian shrinkage so one 5-star review can't win, leave-one-out course baselines, and a fully fictional demo dataset so no real person ever gets a fabricated review attributed to them.

Next.js 16 · TypeScript · Tailwind v4 · Anthropic SDK structured outputs · vitest · GitHub Actions · Vercel.

Live demo + code: {link}. Feedback welcome — especially on the matching heuristics.

---

## Optional shorter variant (~500 characters)

Which professor should you actually take? I built ProfPeek to find out: it joins a public per-instructor grade dataset with student reviews and this term's open sections, ranks professors with Bayesian shrinkage and leave-one-out course baselines, and adds a Claude structured summary with a keyless fallback. The demo dataset is fully fictional so no real person ever gets a fabricated review. Next.js 16 · TypeScript · Anthropic SDK. Demo + code: {link}

## Suggested image

The hero GIF from the README (`docs/screenshots/hero.gif`) or the rankings-card screenshot (`docs/screenshots/rankings-card.png`), recorded in dark mode.

## Hashtags (optional, keep to 3–5)

#NextJS #TypeScript #DataEngineering #BuildInPublic #Anthropic
