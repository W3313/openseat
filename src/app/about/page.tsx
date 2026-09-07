// /about — methodology & disclosure (SPEC 3.6, F11 MUST, F21 SHOULD; MULTI_SCHOOL_DESIGN §5, §8). Server component.
import type { Metadata } from 'next';
import Link from 'next/link';
import { loadSummaryCache } from "@/lib/ai";
import { siteUrl } from "@/lib/config/env";
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { resolveSchoolFlags } from '@/components/layout/schoolFlags';
import {
  AboutSection, AboutToc, AiSection, BadgeLegend, CoverageStats, DemoSection, Glossary, GradesOnlySection, LicensingSection,
  LimitationsSection, MatchTiersTable, PrivacySection, SchoolsTable, ScoringSection, SourcesSection, WhatSection,
  type SchoolsTableRow,
} from '@/components/about';
import { env } from '@/lib/config/env';
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS, findSchoolConfig } from '@/lib/config/schools';
import type { MatchReport, Meta, Professor, School } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';

const SITE_URL = siteUrl.replace(/\/+$/, '');
const TITLE = 'How ProfPeek works · ProfPeek';
const DESCRIPTION =
  'Where each school’s data comes from, why real schools have no reviews, why the demo professors are fictional, and the exact formulas behind every grade delta, badge, name match and AI summary.';

interface SchoolData {
  id: string;
  meta: Meta | null;
  school: School | null;
  report: MatchReport | null;
  professors: Professor[];
}

async function loadSchool(id: string): Promise<SchoolData> {
  const repo = getRepository();
  const [meta, school, report, professors] = await Promise.all([
    repo.getMeta(id).catch(() => null),
    repo.getSchool(id).catch(() => null),
    repo.getMatchReport(id).catch(() => null),
    repo.getProfessors(id).catch(() => [] as Professor[]),
  ]);
  return { id, meta, school, report, professors };
}

async function loadAboutData(): Promise<SchoolData[]> {
  return Promise.all(SCHOOL_IDS.map(loadSchool));
}

export async function generateMetadata(): Promise<Metadata> {
  const all = await loadAboutData();
  const modes = all.map((s) => s.meta?.mode).filter((m): m is Meta['mode'] => m != null);
  const title = modes.length > 0 && modes.every((m) => m === 'demo') ? `${TITLE} · DEMO` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: { title, description: DESCRIPTION, url: `${SITE_URL}/about` },
  };
}

/** (model, count) for every OpenAI-compatible summary across every school's summaries.json, most frequent first. */
async function modelCounts(): Promise<{ model: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const id of SCHOOL_IDS) {
    const cache = await loadSummaryCache(id).catch(() => new Map());
    for (const s of cache.values()) if (s.source === 'openai-compatible' && s.model) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
  }
  return [...counts.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count);
}

/** Registry attribution + meta.json → one sources-table row per school (design §8). */
export function schoolsTableRow(data: SchoolData): SchoolsTableRow {
  const config = findSchoolConfig(data.id);
  const school = data.school;
  const flags = resolveSchoolFlags(school ?? { id: data.id, shortName: config?.shortName, sources: null, mode: config?.mode }, data.meta ? { mode: data.meta.mode } : {});
  const attribution = config?.attribution ?? flags.attribution;
  return {
    id: data.id,
    name: school?.name ?? config?.name ?? data.id,
    shortName: school?.shortName ?? config?.shortName ?? data.id.toUpperCase(),
    mode: config?.mode ?? flags.mode,
    reviewsAvailable: config ? config.sources.reviews !== null : flags.reviewsAvailable,
    seatStatusAvailable: school?.seatStatusAvailable ?? config?.seatStatusAvailable ?? false,
    gradeValueKind: config?.gradeValueKind ?? flags.gradeValueKind,
    gradeBuckets: config?.gradeBuckets ?? flags.gradeBuckets,
    attribution,
    adapters: {
      grades: config?.sources.grades.kind ?? school?.sources.grades ?? 'unknown',
      schedule: config ? (config.sources.schedule?.kind ?? null) : (school?.sources.schedule && school.sources.schedule !== 'none' ? school.sources.schedule : null),
      reviews: config ? (config.sources.reviews?.kind ?? null) : (school?.sources.reviews && school.sources.reviews !== 'none' ? school.sources.reviews : null),
    },
    subjectCount: config ? (config.subjects === 'all' ? null : config.subjects.length) : (data.meta?.subjects?.length ?? null),
    counts: data.meta?.counts ?? null,
    builtAt: data.meta?.builtAt ?? null,
    licenses: (data.meta?.sources ?? []).map((s) => ({ label: s.label, license: s.license, url: s.url })),
    excludedGradeCodes: data.meta?.excludedGradeCodes,
    droppedRows: data.meta?.droppedRows,
  };
}

export default async function AboutPage() {
  const [llmModels, all] = await Promise.all([modelCounts(), loadAboutData()]);
  const primary = all.find((s) => s.id === DEFAULT_SCHOOL_ID) ?? all[0];
  const primaryConfig = findSchoolConfig(primary?.id ?? DEFAULT_SCHOOL_ID);
  const timezone = primary?.school?.timezone ?? primaryConfig?.timezone ?? 'America/Chicago';
  const seatStatusAvailable = primary?.school?.seatStatusAvailable ?? primaryConfig?.seatStatusAvailable ?? true;
  const rows = all.map(schoolsTableRow);
  const realSchools = rows.filter((r) => r.mode !== 'demo');
  const demo = all.find((s) => (findSchoolConfig(s.id)?.mode ?? s.meta?.mode) === 'demo');
  const demoEnabled = demo != null;
  const uiucLike = all.find((s) => s.meta && /uiuc/i.test(s.id)) ?? demo ?? null;
  const summaryCounts = all.reduce(
    (acc, s) => ({
      claude: acc.claude + (s.meta?.counts.summariesClaude ?? 0),
      llm: acc.llm + (s.meta?.counts.summariesOpenAiCompatible ?? 0),
      extractive: acc.extractive + (s.meta?.counts.summariesExtractive ?? 0),
    }),
    { claude: 0, llm: 0, extractive: 0 },
  );
  const currentTerm = primary?.meta?.currentTerm ?? primaryConfig?.currentTerm ?? env.CURRENT_TERM;
  const gradesThroughTerm = primary?.meta?.gradesThroughTerm ?? currentTerm;
  const reportsBySchool = all.filter((s) => s.report);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'About' }]} />
      <header className="mt-4 mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">How ProfPeek works</h1>
        <p className="max-w-3xl text-base text-ink-muted">{DESCRIPTION}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10">
        <aside className="mb-8 lg:mb-0">
          <div className="lg:sticky lg:top-20">
            <AboutToc />
          </div>
        </aside>

        <div className="min-w-0 space-y-12">
          <AboutSection id="what">
            <WhatSection schoolShortName={realSchools[0]?.shortName ?? rows[0]?.shortName ?? 'UIUC'} />
          </AboutSection>

          <AboutSection id="sources">
            <p>
              One row per school in this build. The attribution text is what every page of that school credits in its
              footer; the adapter ids name the code that parsed the source.
            </p>
            <SchoolsTable rows={rows} timezone={timezone} />
            {uiucLike?.meta ? (
              <>
                <h3 className="text-base font-semibold text-ink">Upstream detail — {uiucLike.school?.shortName ?? uiucLike.id.toUpperCase()}</h3>
                <SourcesSection meta={uiucLike.meta} timezone={uiucLike.school?.timezone ?? timezone} />
              </>
            ) : (
              <p>Source details are unavailable until a dataset is built (<code>npm run data:all</code>).</p>
            )}
          </AboutSection>

          <AboutSection id="reviews">
            <GradesOnlySection realSchools={realSchools.map((r) => r.shortName)} demoEnabled={demoEnabled} />
          </AboutSection>

          <AboutSection id="demo">
            <DemoSection mode={demoEnabled ? 'demo' : 'live'} edgeCases={demo?.meta?.edgeCases ?? []} />
          </AboutSection>

          <AboutSection id="scoring">
            <ScoringSection currentTerm={currentTerm} gradesThroughTerm={gradesThroughTerm} yearsBack={env.GRADE_YEARS_BACK} />
          </AboutSection>

          <AboutSection id="badges">
            <BadgeLegend seatStatusAvailable={seatStatusAvailable} />
          </AboutSection>

          <AboutSection id="matching">
            <p>
              Grade rows say <code>&quot;Last, First M&quot;</code>, the schedule says <code>&quot;Last, F&quot;</code>, and
              a review source (where one exists) has separate first and last names. The matcher normalizes all of them
              (diacritics, hyphens, apostrophes, suffixes), then scores every candidate with the tiers below. It is{' '}
              <strong>conservative by design</strong>: an ambiguous match is <em>no</em> match, because a wrong join would
              attribute records to the wrong person.
            </p>
            <MatchTiersTable />
            {reportsBySchool.length === 0 ? (
              <p>No match report yet — run <code>npm run data:ingest</code>.</p>
            ) : (
              reportsBySchool.map((s) => {
                const label = s.school?.shortName ?? s.id.toUpperCase();
                const config = findSchoolConfig(s.id);
                const reviewsAvailable = config ? config.sources.reviews !== null : resolveSchoolFlags(s.school ?? { id: s.id, sources: null }, s.meta ? { mode: s.meta.mode } : {}).reviewsAvailable;
                const report = s.report!;
                return (
                  <div key={s.id} className="space-y-4" data-school={s.id}>
                    <h3 className="text-base font-semibold text-ink">Coverage in this build — {label}</h3>
                    <CoverageStats report={{ coverage: report.coverage, generatedAt: report.generatedAt }} schoolId={s.id} reviewsAvailable={reviewsAvailable} />
                    <p className="text-sm">
                      <Link href={`/about/coverage/${encodeURIComponent(s.id)}`} className="text-link underline underline-offset-2">
                        Every {label} instructor string and how it was resolved ({report.entries.length.toLocaleString('en-US')})
                      </Link>
                    </p>
                  </div>
                );
              })
            )}
          </AboutSection>

          <AboutSection id="ai">
            <AiSection
              model={env.ANTHROPIC_MODEL}
              claudeCount={summaryCounts.claude}
              llmCount={summaryCounts.llm}
              llmProvider={env.GROQ_PROVIDER_NAME}
              llmModel={env.GROQ_MODEL}
              llmModels={llmModels}
              extractiveCount={summaryCounts.extractive}
            />
          </AboutSection>

          <AboutSection id="glossary">
            <Glossary />
          </AboutSection>

          <AboutSection id="limitations">
            <LimitationsSection seatStatusAvailable={seatStatusAvailable} schoolNames={realSchools.map((r) => r.shortName)} />
          </AboutSection>

          <AboutSection id="privacy">
            <PrivacySection />
          </AboutSection>

          <AboutSection id="licensing">
            <LicensingSection />
          </AboutSection>
        </div>
      </div>
    </div>
  );
}
