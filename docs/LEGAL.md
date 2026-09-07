# ProfPeek — Legal research notes

> **This is research, not legal advice.** These notes were compiled from public sources (statutes, court opinions, law-firm summaries, the sites' own terms) on 2026-09-06 for a non-lawyer founder. Nothing here creates an attorney–client relationship, and several questions below are unsettled or jurisdiction-dependent. Bring section 6 to a law-school clinic or an Illinois media/Internet lawyer before charging money or launching user reviews.

Companion docs: [SECURITY.md](SECURITY.md) (threat model and controls), [GO_LIVE.md](GO_LIVE.md) (product plan), [SOURCE_FACTS.md](SOURCE_FACTS.md) (observed upstream shapes).

---

## 1. Executive summary

ProfPeek joins three kinds of data. Each has a different legal footing, and the footing changes with how the product is used.

| Data source | Local / personal use | Public, non-commercial site | Commercial or ad-supported |
|---|---|---|---|
| **UIUC GPA dataset** (per-instructor grade aggregates, Illinois public records) | 🟢 | 🟢 — attribute UIUC + curator; **stop claiming "MIT"** (repo has no license) | 🟢 — same; extend the 10-student floor to every displayed slice; never use instructor names in ads |
| **UIUC Course Explorer** (schedule XML) | 🟢 | 🟢 — facts, no published terms; note robots.txt disallows `/cisapp/`; fetch politely with an identified User-Agent | 🟡 — legally low risk, but undocumented, unlicensed and shut-off-able; ask the Registrar in writing before monetising |
| **RateMyProfessors scraping** (unofficial GraphQL endpoint) | 🟡 — technical ToS breach, no realistic enforcement | 🔴 — breaches ToS §§4, 6; review text is student-owned copyright; C&D / DMCA-to-host is the realistic outcome | 🔴 **Do not build on it.** Express commercial-use ban, NY venue, fee-shifting indemnity, injunction carve-out; obtain a written licence or replace the source |
| **First-party reviews** (collected on ProfPeek) | n/a | 🟢 with Section 230 + DMCA 512 compliance (agent registration, takedown flow, repeat-infringer policy, removal-only moderation) | 🟢 same, plus: paid features must never affect ranking or content |
| **AI summaries** (ProfPeek's own generated text about named people) | 🟢 | 🟡 — first-party speech, almost certainly **no** Section 230 cover; label, quote-anchor, ban topics, correction channel | 🟡 — same, plus higher press/regulatory scrutiny (FTC §5; EU AI Act Art. 50 if EU users) |

**Bottom line.** Grades + schedule are lawful to publish and widely precedented (Berkeleytime, Madgrades, TAMU sites, UT Austin's own dashboard). RMP data is the one input that cannot support a marketable product; link out with plain-text attribution instead. Everything ProfPeek *itself* says about a real instructor — rankings, badges, AI summaries, a mis-joined name — is ProfPeek's own speech and needs the process controls in §4.

---

## 2. RateMyProfessors

### 2.1 What the Terms of Use say
RMP's Terms of Use ([ratemyprofessors.com/terms-of-use](https://www.ratemyprofessors.com/terms-of-use), fetched 2026-09-06) are a browsewrap: "BY USING THIS SITE, YOU ARE ACCEPTING THE TERMS OF USE", applying to all visitors, registered or not.

| Clause | Effect on ProfPeek |
|---|---|
| §4 — use limited to "noncommercial … limited personal use"; no reproducing, creating derivative works from, displaying or distributing "Material" to third parties without written consent | Any public display of RMP-derived data breaches §4 |
| §6 — "except with our prior permission", no "manual or automated software, devices, scripts, robots or other means" to "access, scrape, crawl or spider" the Site; no use "for commercial or business purposes" | The GraphQL adapter is exactly what §6 describes; ads or paid tiers hit the commercial clause separately |
| §10 — users **retain ownership** of postings; RMP gets a perpetual, apparently non-exclusive licence | Review text is each student's copyright, not RMP's (see §2.5) |
| §19 — binding individual arbitration, **but** IP claims carved out and RMP may seek injunctions in court | RMP keeps the remedy that actually matters against a scraper |
| §20 — New York law, Manhattan venue; indemnity clause covers "reasonable attorneys' fees" | Unfavourable forum; fee exposure |

No clause mentions "API". The Terms say scraping is allowed "with our prior permission" — which is the one lawful path if RMP data is ever wanted publicly.

RMP's [robots.txt](https://www.ratemyprofessors.com/robots.txt) is `Disallow: /` for unnamed agents and blocks AI crawlers explicitly. robots.txt is not a contract and courts have held it is not a DMCA §1201 "technological measure" ([Norton Law survey, 2026](https://nortonlaw.com/2026/05/14/dmca-section-1201-claims-the-new-battleground-for-ai-and-data-scraping-litigation/)), but it is evidence RMP does not consent to bots and supports an "actual knowledge" argument for browsewrap enforcement.

### 2.2 CFAA: Van Buren, hiQ, and the fixed-token problem
- *Van Buren v. United States* (2021): one "exceeds authorized access" only by reaching parts of a computer that are off-limits ("gates-up-or-down"); footnote 8 left open whether contracts can define the gate. [law.cornell.edu/supremecourt/text/19-783](https://www.law.cornell.edu/supremecourt/text/19-783)
- *hiQ Labs v. LinkedIn* (9th Cir. 2022): scraping public pages is likely not access "without authorization" because a public site "has erected no gates"; a cease-and-desist does not change that for public pages. [Justia](https://law.justia.com/cases/federal/appellate-courts/ca9/17-16783/17-16783-2022-04-18.html); [EFF analysis](https://www.eff.org/deeplinks/2022/04/scraping-public-websites-still-isnt-crime-court-appeals-declares)
- *Sandvig v. Barr* (D.D.C. 2020): a ToS violation alone is not criminal CFAA access. [EFF](https://www.eff.org/deeplinks/2020/04/federal-judge-rules-it-not-crime-violate-websites-terms-service)
- **The wrinkle:** *Ryanair v. Booking* (D. Del. 2022) held a C&D *can* revoke authorization where "an authentication mechanism protected access" ([Proskauer](https://www.proskauer.com/blog/district-court-decision-brings-new-life-to-cfaa-to-combat-unwanted-scraping)); a 2024 jury verdict was overturned on the $5,000 loss threshold ([Goldman blog](https://blog.ericgoldman.org/archives/2025/03/court-overturns-a-bad-jury-verdict-against-scraping-ryanair-v-booking-guest-blog-post.htm)); the Third Circuit appeal terminated Aug. 2025 with the disposition not retrieved ([CourtListener](https://www.courtlistener.com/docket/70708980/authorities/ryanair-dac-v-booking-holdings-inc/)).

The RMP call sends a fixed `Authorization: Basic …` header that RMP's own public frontend ships to every anonymous visitor. **No case squarely decides whether reusing a universal, hard-coded client token is passing a "gate."** Best argument it is not: every browser sends it, no individual permission is required (hiQ logic). Best argument it is: it is literally an authentication header, and after a C&D a plaintiff would frame it as credential misuse (Ryanair logic). Treat this as the largest CFAA uncertainty. Civil CFAA also requires $5,000 loss in a year; a criminal referral does not.

### 2.3 Contract: the theory that actually works against scrapers
- *hiQ* lost on contract after winning on CFAA: $500,000 consent judgment, permanent injunction, data deletion (N.D. Cal. Nov. 2022; [FindLaw](https://caselaw.findlaw.com/court/us-dis-crt-n-d-cal/2182242.html); [Proskauer](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/)). hiQ was bound because it had accounts and used fake "turker" accounts.
- *Meta v. Bright Data* (N.D. Cal. Jan. 2024): Meta's terms bound only account holders; logged-out scraping by a non-user was not a breach ([Goldman blog](https://blog.ericgoldman.org/archives/2024/01/game-on-bright-data-scores-major-victory-in-web-scraping-dispute-with-meta-guest-blog-post.htm)). **RMP's terms say "BY USING THIS SITE" and reach non-registered visitors, so this escape does not map cleanly.**
- *X Corp v. Bright Data* (N.D. Cal. May 2024): contract and misappropriation claims over public data were **preempted by the Copyright Act** because X held only a non-exclusive licence to user content; browsewraps are enforceable against a party with *actual knowledge* ([Skadden](https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view); [MoFo](https://www.mofo.com/resources/insights/240604-california-federal-court-holds-x-s-claims)). RMP is in the same non-exclusive-licence position, so the defence exists — but it is one district-court ruling outside RMP's chosen forum.
- *Southwest v. Kiwi.com* (N.D. Tex. 2021): browsewrap + knowledge supported an injunction against a commercial scraper ([Goldman blog](https://blog.ericgoldman.org/archives/2021/10/tos-supports-injunction-against-web-scraping-southwest-airlines-v-kiwi.htm)).
- Second Circuit / New York (RMP's forum): terms bind when a reasonably prudent user had notice — *Specht v. Netscape* (2002), *Meyer v. Uber* (2017, [Justia](https://law.justia.com/cases/federal/appellate-courts/ca2/16-2750/16-2750-2017-08-17.html)). A footer-link browsewrap is weak against an anonymous visitor, but **ProfPeek's own repo documents knowledge that the endpoint is unofficial**, and any C&D supplies actual notice.

### 2.4 Trespass to chattels
*Intel v. Hamidi* (Cal. 2003) requires actual impairment of the system ([EFF treatise](https://ilt.eff.org/Trespass_to_Chattels.html)); *X Corp v. Bright Data* dismissed trespass for failure to plead server harm. New York's *Register.com v. Verio* (2d Cir. 2004) accepted ~2.3 % of capacity as harm, and RMP chose New York law. A rate-limited, cached, one-school crawl is unlikely to qualify; the risk rises with scope.

### 2.5 Copyright: facts vs. review text
- Facts are not copyrightable (*Feist v. Rural*, 1991, [Justia](https://supreme.justia.com/cases/federal/us/499/340/)). RMP's numbers — avgRating, avgDifficulty, numRatings, wouldTakeAgainPercent, tag counts, names, departments — are facts or arithmetic on facts. Caveat: judgment-based numeric estimates can be expression (*CDN v. Kapes*, 9th Cir. 1999, [Justia](https://law.justia.com/cases/federal/appellate-courts/F3/197/1256/546451/)); RMP's averages are mechanical, so they sit on the fact side.
- **Review text is a separately-owned copyrighted work of each student.** RMP's §10 confirms users retain ownership. Under 17 U.S.C. §501(b) only the owner of an exclusive right can sue for infringement, so RMP's standing over the text is doubtful — but RMP can assert its compilation copyright, send DMCA notices to Vercel/GitHub, and argue AI summaries are derivative works.
- Fair use for excerpts in a competing product is weak: *AP v. Meltwater* (S.D.N.Y. 2013, [Copyright Office summary](https://www.copyright.gov/fair-use/summaries/ap-meltwater-sdny2013.pdf)) and *Thomson Reuters v. Ross* (D. Del. Feb. 2025, [DWT](https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2025/02/reuters-ross-court-ruling-ai-copyright-fair-use)) rejected fair use for commercial aggregation without commentary; *Authors Guild v. Google* (2d Cir. 2015, [Justia](https://law.justia.com/cases/federal/appellate-courts/ca2/13-4829/13-4829-2015-10-16.html)) is the favourable snippet case. Summaries that convey ideas without reproducing expression are not themselves copies, but the ingestion step is a reproduction whose status is unsettled (*Ross* vs. *Bartz v. Anthropic*, [Akin](https://www.akingump.com/en/insights/ai-law-and-regulation-tracker/district-court-rules-ai-training-can-be-fair-use-in-bartz-v-anthropic)).
- DMCA §1201 anti-circumvention bites only if ProfPeek bypasses an access control (CAPTCHA, login, bot challenge): *Ticketmaster v. Prestige* ([Proskauer](https://newmedialaw.proskauer.com/2018/02/09/cfaa-unauthorized-access-web-scraping-claim-against-ticket-broker-dismissed-because-revocation-of-access-not-expressed-in-cease-and-desist-letter/)). Sending the frontend's own token is not obviously circumvention; proxies, IP rotation or CAPTCHA solvers after a block would be.
- Hot-news misappropriation and US database rights are weak threats (*Barclays v. Theflyonthewall*, 2d Cir. 2011, [Justia](https://law.justia.com/cases/federal/appellate-courts/ca2/10-1372/10-1372_both-2011-06-20.html); the US has no sui generis database right).

### 2.6 Practical enforcement pattern (observed, not law)
No reported lawsuit, public C&D or GitHub DMCA notice by RMP against a scraper was found ([github/dmca](https://github.com/github/dmca) search; dozens of open clients exist, e.g. [PyPI RateMyProfessorAPI](https://pypi.org/project/RateMyProfessorAPI/)). One developer blog reports receiving a C&D email after using the undocumented API ([Medium](https://medium.com/@williamyeny/finding-ratemyprofessors-private-api-with-chrome-developer-tools-bd6747dd228d); single anecdote). RMP has no official API or data-licensing programme. Its enforcement is technical (robots.txt, AI-bot blocks, endpoint changes). The industry ladder is: silent blocking → C&D (which also creates actual notice and possibly CFAA revocation) → DMCA to hosts → suit for breach/injunction. Commercial visibility is what triggers the letter. RMP has been owned since Dec. 2023 by Archetype ([Cheddar announcement](https://www.cheddar.com/media/cheddar-news-has-new-owners/)), a media company with ad revenue to protect.

### 2.7 Verdict
| Tier | Risk | Conditions |
|---|---|---|
| Local / personal | **Low** | Technical browsewrap breach; no damages, no public display, no plausible CFAA theory for public data. Keep outputs gitignored (already), tiny volume, stop if blocked. |
| Public non-commercial | **Medium** | Breaches §§4, 6 regardless of ads. Realistic worst case: DMCA to Vercel/GitHub plus a C&D. If done anyway: aggregates only, no review text, link out, once-per-term refresh, honest UA, kill switch, and ask RMP for written permission first. |
| Commercial / ad-supported | **High — do not build on it** | Express commercial ban, injunction carve-out, NY venue, fee indemnity; *Kiwi* and *hiQ* show contract claims succeed against commercial scrapers with knowledge; a C&D converts the token question into live CFAA exposure. Either get a written licence from Rate My Professors, LLC or replace the source. |

**Trademark use:** RATEMYPROFESSORS.COM is a registered mark (Reg. No. 3407911, [Justia](https://trademarks.justia.com/770/58/ratemyprofessors-77058361.html)). Plain-text "RateMyProfessors (not affiliated)" to identify a link target is nominative fair use (*New Kids on the Block*, 9th Cir. 1992); no logo, no "RMP-powered", never in ProfPeek's name, domain or ad keywords.

---

## 3. Grade data

### 3.1 FERPA binds UIUC, not ProfPeek
FERPA (20 U.S.C. §1232g, [LII](https://www.law.cornell.edu/uscode/text/20/1232g)) is a funding condition on institutions with a "policy or practice" of releasing education records. It does not regulate a downstream party that never received PII, and creates no private right of action (*Gonzaga v. Doe*, 2002). Aggregate distributions with no student identifiers are not education records of any student; 34 CFR §99.31(b) ([LII](https://www.law.cornell.edu/cfr/text/34/99.31)) expressly permits release of de-identified data after a "reasonable determination" that no student is identifiable "taking into account other reasonably available information." NCES: "Nothing in FERPA prohibits a school from disclosing information in aggregate" ([NCES](https://nces.ed.gov/pubs2006/stu_privacy/datarequests.asp)). ProfPeek's exposure is reputational and via re-identification, not a FERPA claim.

### 3.2 Small-cell suppression policy
Federal law sets no number. ED's PTAC: 3 is "the absolute minimum," 5 or 10 are common, states use 5–30 with a majority at 10 ([PTAC FAQ](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/FAQs_disclosure_avoidance_0.pdf); [DQC](https://dataqualitycampaign.org/wp-content/uploads/2017/06/DQC-N-size-paper-FINAL.pdf)). UIUC itself withholds sections with low enrollment or uniform grades; the current CSV has a minimum of 21 students per row ([dataset README](https://raw.githubusercontent.com/wadefagen/datasets/main/gpa/README.md)). Peer thresholds: Texas A&M < 5, UW-Madison ≤ 5, UIUC ≤ 20.

**ProfPeek policy (to adopt):** `MIN_GRADED_N = 10` applies to **every displayed slice** — headline rows, per-year trend points, per-course rows, W/DFW rates, badge inputs — not only headline rows. Collapse letter-grade histogram buckets (A-range / B-range / C-range / D–F / W) whenever any bucket in a displayed single-section or single-term view is below 3. Document the rule at `/about#privacy`. Per-school floor for future schools: `max(10, school's own threshold)`.

### 3.3 Illinois FOIA
UIUC is a "public body" (5 ILCS 140/2, [ilga.gov](https://www.ilga.gov/Documents/legislation/ilcs/documents/000501400K2.htm)). Exemption 7(1)(c) states that information which "bears on the public duties of public employees" is not an invasion of privacy ([5 ILCS 140/7](https://www.ilga.gov/Documents/legislation/ilcs/documents/000501400K7.htm)) — assigning grades is a public duty, which is why instructor names are released. UIUC has released the data since FOIA #16-456 (2016) and, from Spring 2025, proactively under Senate item EP.25.072, whose committee stated the information "is already public, cannot be legally withheld, and commonly released by peer institutions" ([EP.25.072 PDF](https://www.senate.illinois.edu/2024-2025/20250428senate/EP25072_FINAL_20250428.pdf)).

### 3.4 Dataset licence — the README is wrong
**`wadefagen/datasets` declares no licence** (GitHub API `license: null`, no LICENSE file, verified 2026-09-06; [repo](https://github.com/wadefagen/datasets)). ProfPeek's README, SPEC, SOURCE_FACTS, architecture.md and `UiucGpaCsvSource.ts` (`license: 'MIT'`) all say MIT. The numbers are uncopyrightable public records (*Feist*), so republishing is low-risk regardless, but stating a false licence on a marketed product is a diligence problem. **Fix:** reword everywhere to "Illinois public records (FOIA; UIUC Senate EP.25.072) curated by Wade Fagen-Ulmschneider; no licence declared," ask the maintainer to add one (CC0 / ODC-BY fit), and file ProfPeek's own FOIA request (foia@uillinois.edu) so chain of title runs UIUC → ProfPeek.

### 3.5 Course Explorer terms
The CIS API documentation pages now redirect to the homepage; no published terms, rate limits or attribution rules exist (2026-09-06). [courses.illinois.edu/robots.txt](https://courses.illinois.edu/robots.txt) contains `Disallow: /cisapp/` and `Disallow: /cisdocs/`. The University of Illinois System Terms of Use ([vpaa.uillinois.edu](https://www.vpaa.uillinois.edu/resources/terms_of_use), rev. 2020-10-28) contain disclaimers only — no reuse, redistribution or automation ban. Schedule facts are uncopyrightable. **Net:** legally low risk today; operationally an unlicensed, robots-disallowed API that can be gated at any time. Fetch politely with a descriptive User-Agent and contact email (none is set today), cache per term, and write to the Registrar / Technology Services for acknowledgement before monetising.

### 3.6 Defamation and right of publicity
- True aggregate grades next to a real name are not defamatory; Illinois requires a false statement of fact and truth is a complete defence ([DMLP Illinois](https://www.dmlp.org/legal-guide/illinois-defamation-law)). Algorithmic professional ratings were held protected opinion in *Browne v. Avvo* (W.D. Wash. 2007, [Goldman](https://blog.ericgoldman.org/archives/2007/12/avvo_wins_big_i.htm)). Real exposure: (1) a **wrong name-match** is a false statement of fact ProfPeek makes; (2) AI summaries (see §4).
- Illinois Right of Publicity Act (765 ILCS 1075) bars using a name for a "commercial purpose" (sale/advertising), with a §35(b) exemption for non-commercial, news and public-affairs uses ([§5](https://www.ilga.gov/Documents/legislation/ilcs/documents/076510750K5.htm), [§35](https://www.ilga.gov/Documents/legislation/ilcs/documents/076510750K35.htm)). *Vrdolyak v. Avvo* (N.D. Ill. 2016) held a public-records lawyer directory with ratings and adjacent ads "fully protected by the First Amendment," warning that otherwise publishing "truthful newsworthy information about individuals such as teachers" would risk liability merely for running ads ([Goldman](https://blog.ericgoldman.org/archives/2016/09/avvos-attorney-profile-pages-dont-violate-publicity-rights-vrdolyak-v-avvo.htm)). **Rule:** the directory is protected even if monetised; never put an instructor's name or likeness *in* ProfPeek's advertising, promos or per-professor paid features. Statutory minimum $1,000 per violation, one-year limitations.

### 3.7 Peer precedent
Instructor-level grade publication is widespread and unchallenged in searches: UIUC's own faculty-hosted visualizations ([waf.cs.illinois.edu](https://waf.cs.illinois.edu/discovery/grade_disparity_between_sections_at_uiuc/); [Daily Illini 2023](https://dailyillini.com/news-stories/2023/03/20/gpa-visualization/)); Texas A&M Registrar PDFs ([web-as.tamu.edu/gradereports](https://web-as.tamu.edu/gradereports)); UW-Madison Registrar reports + Madgrades ([registrar.wisc.edu](https://registrar.wisc.edu/grade-reports/)); UT Austin's official dashboard ([reports.utexas.edu](https://reports.utexas.edu/spotlight-data/ut-course-grade-distributions)); Berkeleytime (ASUC, MIT-licensed, [GitHub](https://github.com/asuc-octo/berkeleytime)). Counter-examples where universities *withdrew* data: Cornell median grades (2011, [Cornell Chronicle](https://news.cornell.edu/node/270308)), Yale Bluebook+ (2014, [TechCrunch](https://techcrunch.com/?p=941684)), MSU disciplinary case for scraping behind a NetID (2024–26). Lesson: use only affirmatively public or public-records data; never fetch behind a login.

---

## 4. Hosting reviews and AI summaries

### 4.1 Section 230 — what it covers
47 U.S.C. §230(c)(1) ([LII](https://www.law.cornell.edu/uscode/text/47/230)): no provider "shall be treated as the publisher or speaker of any information provided by another information content provider." Covers user reviews ProfPeek hosts. Lost where ProfPeek is "responsible, in whole or in part, for the creation or development" of the content — the *Roommates.com* "material contribution" test; *Jones v. Dirty World* (6th Cir. 2014) kept immunity for a site that selected, edited and commented on posts without materially contributing to their defamatory content ([Proskauer](https://newmedialaw.proskauer.com/2014/06/16/sixth-circuit-reinforces-cda-immunity-reverses-lower-court-in-jones-v-dirty-world/)). Exclusions (§230(e)): federal criminal law and **intellectual property** — copyright claims over user reviews are not covered.

### 4.2 Section 230 — what it does not cover: ProfPeek's own speech
Rankings, badges, verdict text, grade-delta claims and **AI summaries** are first-party speech. The 2023–2026 trend treats generative output as the operator's own content: the statute's authors Cox and Wyden say so ([Fortune](https://www.fortune.com/2023/09/07/authors-of-section-230-supreme-court-certainty-landmark-internet-law-ai-uncharted-territory-politics-tech-wyden-cox)); Perault, *Section 230 Won't Protect ChatGPT* ([Lawfare](https://www.lawfaremedia.org/article/section-230-wont-protect-chatgpt)); CRS LSB11097 ([congress.gov](https://www.congress.gov/crs-product/LSB11097)); *Bouck v. Meta* (N.D. Cal. Mar. 2026) denied 230 dismissal where GenAI tools "developed the ultimate content" ([Volokh](https://reason.com/volokh/2026/03/27/no-%C2%A7-230-immunity-for-metas-ai-generated-ads/)); Crowell's "pipe vs. post" analysis flags "platforms summarizing reviews" as likely unprotected ([Crowell](https://www.crowell.com/en/insights/client-alerts/the-pipe-not-the-posts-how-section-230s-protections-extend-to-generative-ai-platforms)). **Assume ProfPeek is the speaker of every AI summary.**

Defamation consequences: *Milkovich v. Lorain Journal* (1990, [Justia](https://supreme.justia.com/cases/federal/us/497/1/)) — opinion framing does not save implied false facts. Most professors are private figures (negligence standard) ([NACUA](https://www.nacua.org/docs/default-source/jcul-articles/volume46/4_defamationclaimshighereducation.pdf?sfvrsn=16b346be_4)). *Walters v. OpenAI* (Ga. 2025) shows adjacent warnings and demonstrable diligence helped the defendant ([Cleary](https://www.clearygottlieb.com/news-and-insights/publication-listing/georgia-court-dismisses-defamation-lawsuit-against-openai-over-chatgpt-output)); *Wolf River Electric v. Google* (Minn., pending) is the strongest live AI-libel case ([Volokh](https://reason.com/volokh/2026/01/12/google-missed-key-deadline-in-suit-alleging-googles-ai-libeled-business-court-holds/)). Illinois strengthened its anti-SLAPP statute Aug. 2025 ([IFS](https://www.ifs.org/blog/illinois-takes-a-step-forward-anti-slapp-improvements-enacted-into-law/)), which helps defend opinion.

### 4.3 AI-summary design requirements (before any summary appears next to a real name)
1. Label "AI-generated summary of N student reviews; may contain errors" **adjacent** to the text (EU AI Act Art. 50 will require labelling from Aug. 2026 if EU users are in scope — [EC guidelines](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)).
2. Quote-anchored: every sentence cites `evidenceReviewIds` and uses attribution phrasing ("several reviewers say"); a post-generation validator drops sentences whose claims are not found in the cited text. The existing evidence-ID check is the base.
3. Banned-topic list in prompt, schema and post-filter: legal/bias/misconduct accusations, personal life, health, identity.
4. Minimum 5 reviews; show confidence; always surface a watch-out when critical reviews exist; always show the critical count next to positive quotes (the Tripadvisor/Which? failure — [Euronews](https://www.euronews.com/travel/2026/07/03/tripadvisor-ai-summaries-give-glowing-reviews-to-dangerous-hotels-consumer-watchdog-finds)).
5. Regenerate or unpublish automatically when an input review is removed (`inputHash` supports this); keep prompt version, model and inputs per summary as diligence evidence.
6. Rename "verdict" to "What students say." Keep `SUMMARY_ON_DEMAND` off in production so every published summary passed validation.
7. Offer instructors a reply, a correction/dispute form with a response SLA, and an opt-out from the AI summary (not from factual grade data).
8. ProfPeek cannot copyright its summaries or rankings (Copyright Office Part 2, [PDF](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf); *Thaler v. Perlmutter*, D.C. Cir. 2025); treat them as a service, not an asset.

### 4.4 DMCA 512 (required once users can post)
17 U.S.C. §512(c) ([LII](https://www.law.cornell.edu/uscode/text/17/512)): register a designated agent with the Copyright Office ($6, renew every 3 years, [directory](https://www.copyright.gov/dmca-directory/)) **and** publish the agent's contact on the site; act expeditiously on compliant notices; honour counter-notices with put-back in 10–14 business days (§512(g)); adopt and reasonably implement a repeat-infringer policy (§512(i)); add a ToS rule against reposting content from other sites (so RMP text is not laundered in).

### 4.5 Moderation and right-of-reply plan
- Guidelines modelled on RMP's ([guidelines](https://www.ratemyprofessors.com/guidelines)): no accusations of illegal conduct or bias, no personal/family/health/sex-life content, no contact info, no reposting.
- Verified-student gate (edu-email magic link; store a salted hash and the domain only).
- Removal-only moderation — never rewrite or sharpen a post (*Jones v. Dirty World*). Automated pre-checks (profanity, contact info, accusation patterns); human review of flags within 48 h; appeals mailbox.
- Verified professor replies; a correction/dispute channel with a 5-business-day acknowledgement target; documented notice-and-response process (also satisfies UK Defamation Act s.5 and DSA Art. 16 if ever needed).
- Never solicit, seed or auto-generate reviews; never let paid features affect ranking or content (FTC Consumer Reviews Rule, 16 CFR 465, [FTC](https://www.ftc.gov/news-events/news/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials); the German *jameda* deletion ruling for non-neutral portals).
- EU/UK: state US-only scope for now; if that changes add DSA Art. 16 notice-and-action, GDPR legitimate-interest assessment (the *spickmich* teacher-rating precedent), UK Online Safety Act duties, AI Act labelling.

---

## 5. Trademark and name

- No registered or pending US mark for PROFPEEK / PROF PEEK / PROFESSOR PEEK was found in indexed sources, **but the USPTO database could not be queried directly** — run the free search at [uspto.gov/trademarks/search](https://www.uspto.gov/trademarks/search) (classes 9, 41, 42).
- "Professor Peek" is an existing free Chrome extension by a Cornell student (402 users, updated July 2025, no licence, no TM claim; [Chrome Web Store](https://chromewebstore.google.com/detail/professor-peek/jilfmfcpampggogoeppklpbkkejnoglo)); "Prof Peek SEU" also exists (5 users). Unregistered marks still support confusion claims under 15 U.S.C. §1125(a) ([LII](https://www.law.cornell.edu/uscode/text/15/1125)), limited to the area and goods of actual use.
- Likelihood of confusion ([USPTO test](https://www.uspto.gov/trademarks/search/likelihood-confusion)): "ProfPeek" and "Professor Peek" are near-identical in sound and meaning for the same service to the same purchasers — **material** in trademark terms, low in practical terms today. An examiner would likely cite any earlier filing; the name cannot be cleanly owned.
- Domains (RDAP, 2026-09-06): profpeek.com/.app/.io **available**; profcurve.com/.app/.io, sectionsage.com/.app/.io, profdelta.com/.app available; proflens, coursecurve, seatsage, profscope taken; "GradePeek" and "ProfScope" are existing products.

**Decision:** before any marketing, either (a) obtain a short written coexistence/assignment letter from the Professor Peek author and register profpeek.com/.app today, or (b) rename to a clear name — **ProfCurve** fits the grades-first positioning — and file a $350/class intent-to-use application ([USPTO fees](https://www.uspto.gov/trademarks/trademark-fee-information)). Default if no reply within two weeks: rename.

---

## 6. Questions for a lawyer (bring this list)

**Data sources**
1. Is the 10-student floor applied to every displayed slice, plus histogram-bucket collapsing below 3, a defensible de-identification standard for Illinois public records, given UIUC already suppresses ≤ 20?
2. Should ProfPeek file its own FOIA request for the grade data, and what response language should be quoted on `/about`?
3. Does Course Explorer's `robots.txt` disallow of `/cisapp/` matter legally for a polite, identified, cached fetch, and what should the letter to the Registrar say?
4. If RMP data is ever shown (aggregates only, link out): does the fixed frontend token change the CFAA/§1201 analysis? Does the X Corp preemption defence travel to a New York forum?

**ProfPeek's own speech**
5. Are Illinois public-university faculty public officials/figures for defamation purposes (actual-malice standard) or private figures (negligence)?
6. Is the planned AI-summary design (labelling, quote-anchoring, banned topics, opt-out) sufficient diligence under *Walters*-style reasoning? Should summaries be disabled for real names until first-party review volume exists?
7. Do badges ("Easy A", "Tough but loved") need renaming for real instructors, or does *Browne v. Avvo* opinion protection cover them with the formula published?
8. Is a mis-joined name (reviews attached to the wrong person) adequately mitigated by match-tier disclosure and a correction SLA, or should sub-T2 matches be suppressed entirely?

**Hosting reviews**
9. Review the ToS user-content licence (non-exclusive, sublicensable, covers "analyze and summarize"), warranties, anti-repost rule, and whether to include arbitration.
10. DMCA 512 setup: agent registration, notice/counter-notice text, repeat-infringer policy wording.
11. Retention policy for poster metadata (edu-email hash, IP) and response to John Doe subpoenas.
12. Illinois anti-SLAPP (Citizen Participation Act as amended Aug. 2025) posture and media-liability insurance options for a one-person LLC.

**Business**
13. Trademark: keep ProfPeek with a coexistence letter, or rename? Class selection for an ITU filing.
14. Illinois Right of Publicity: confirm that campus sponsorships on subject pages (never instructor pages) stay within the *Vrdolyak* protection.
15. Vercel Hobby fair-use terms vs. donations/sponsorship — when exactly must the plan change?
16. Privacy policy adequacy under CalOPPA; confirm CCPA/CPRA, COPPA and GDPR are out of scope at launch scale and US-only framing.
17. Is an Illinois LLC sufficient, and should the domain, hosting and mailboxes move under it before the first user review?

---

## Sources

Primary legal texts: [17 U.S.C. §107](https://www.law.cornell.edu/uscode/text/17/107) · [17 U.S.C. §512](https://www.law.cornell.edu/uscode/text/17/512) · [47 U.S.C. §230](https://www.law.cornell.edu/uscode/text/47/230) · [20 U.S.C. §1232g](https://www.law.cornell.edu/uscode/text/20/1232g) · [34 CFR §99.31](https://www.law.cornell.edu/cfr/text/34/99.31) · [5 ILCS 140/7](https://www.ilga.gov/Documents/legislation/ilcs/documents/000501400K7.htm) · [765 ILCS 1075](https://law.justia.com/codes/illinois/chapter-765/act-765-ilcs-1075/) · [15 U.S.C. §1125](https://www.law.cornell.edu/uscode/text/15/1125) · [Cal. Bus. & Prof. Code §22575 (CalOPPA)](https://codes.findlaw.com/ca/business-and-professions-code/bpc-sect-22575/) · [16 CFR Part 465](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465)

Cases: [Van Buren](https://www.law.cornell.edu/supremecourt/text/19-783) · [hiQ v. LinkedIn (9th Cir. 2022)](https://law.justia.com/cases/federal/appellate-courts/ca9/17-16783/17-16783-2022-04-18.html) · [hiQ SJ order (N.D. Cal. 2022)](https://caselaw.findlaw.com/court/us-dis-crt-n-d-cal/2182242.html) · [Feist v. Rural](https://supreme.justia.com/cases/federal/us/499/340/) · [Authors Guild v. Google](https://law.justia.com/cases/federal/appellate-courts/ca2/13-4829/13-4829-2015-10-16.html) · [Barclays v. Theflyonthewall](https://law.justia.com/cases/federal/appellate-courts/ca2/10-1372/10-1372_both-2011-06-20.html) · [Meyer v. Uber](https://law.justia.com/cases/federal/appellate-courts/ca2/16-2750/16-2750-2017-08-17.html) · [Milkovich](https://supreme.justia.com/cases/federal/us/497/1/) · [CDN v. Kapes](https://law.justia.com/cases/federal/appellate-courts/F3/197/1256/546451/) · [Anderson v. TikTok](https://law.justia.com/cases/federal/appellate-courts/ca3/22-3061/22-3061-2024-08-27.html) · [Thaler v. Perlmutter](https://law.justia.com/cases/federal/appellate-courts/cadc/23-5233/23-5233-2025-03-18.html) · [Browne v. Avvo](https://caselaw.findlaw.com/court/us-dis-crt-w-d-was-at-sea/2190675.html)

Site terms and data: [RMP Terms of Use](https://www.ratemyprofessors.com/terms-of-use) · [RMP robots.txt](https://www.ratemyprofessors.com/robots.txt) · [RMP Guidelines](https://www.ratemyprofessors.com/guidelines) · [wadefagen/datasets](https://github.com/wadefagen/datasets) · [gpa README](https://raw.githubusercontent.com/wadefagen/datasets/main/gpa/README.md) · [UIUC Senate EP.25.072](https://www.senate.illinois.edu/2024-2025/20250428senate/EP25072_FINAL_20250428.pdf) · [courses.illinois.edu/robots.txt](https://courses.illinois.edu/robots.txt) · [U of I System Terms of Use](https://www.vpaa.uillinois.edu/resources/terms_of_use) · [PTAC disclosure-avoidance FAQ](https://studentprivacy.ed.gov/sites/default/files/resource_document/file/FAQs_disclosure_avoidance_0.pdf)

Analysis: [EFF on hiQ](https://www.eff.org/deeplinks/2022/04/scraping-public-websites-still-isnt-crime-court-appeals-declares) · [EFF on Ryanair](https://www.eff.org/deeplinks/2025/07/ryanairs-cfaa-claim-against-bookingcom-has-nothing-do-actual-hacking) · [Skadden on X v. Bright Data](https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view) · [Goldman on Meta v. Bright Data](https://blog.ericgoldman.org/archives/2024/01/game-on-bright-data-scores-major-victory-in-web-scraping-dispute-with-meta-guest-blog-post.htm) · [Norton Law §1201 survey](https://nortonlaw.com/2026/05/14/dmca-section-1201-claims-the-new-battleground-for-ai-and-data-scraping-litigation/) · [Lawfare (Perault)](https://www.lawfaremedia.org/article/section-230-wont-protect-chatgpt) · [CRS LSB11097](https://www.congress.gov/crs-product/LSB11097) · [Crowell "pipe vs post"](https://www.crowell.com/en/insights/client-alerts/the-pipe-not-the-posts-how-section-230s-protections-extend-to-generative-ai-platforms) · [DMLP Illinois defamation](https://www.dmlp.org/legal-guide/illinois-defamation-law) · [DMLP Illinois publicity](https://www.dmlp.org/legal-guide/illinois-right-publicity-law) · [Goldman on Vrdolyak v. Avvo](https://blog.ericgoldman.org/archives/2016/09/avvos-attorney-profile-pages-dont-violate-publicity-rights-vrdolyak-v-avvo.htm) · [Seyfarth ADA filings 2025](https://www.adatitleiii.com/2026/03/federal-court-website-accessibility-lawsuit-filings-bounce-back-in-2025/) · [USPTO likelihood of confusion](https://www.uspto.gov/trademarks/search/likelihood-confusion)
