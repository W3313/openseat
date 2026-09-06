// /about — methodology & disclosure (SPEC 3.6, F11 MUST, F21 SHOULD). Server component; TSX, not MDX.
import type { Metadata } from 'next';
import { loadSummaryCache } from "@/lib/ai";
import { siteUrl } from "@/lib/config/env";
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import {
  AboutSection, AboutToc, AiSection, BadgeLegend, CoverageStats, DemoSection, Glossary, LicensingSection,
  LimitationsSection, MatchReportTable, MatchTiersTable, PrivacySection, ScoringSection, SourcesSection, WhatSection,
  type ProfessorRef,
} from '@/components/about';
import { env } from '@/lib/config/env';
import { DEFAULT_SCHOOL_ID, SCHOOL_REGISTRY } from '@/lib/config/schools';
import type { MatchReport, Meta, Professor, School } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';

const SITE_URL = siteUrl.replace(/\/+$/, '');
const TITLE = 'How ProfPeek works · ProfPeek';
const DESCRIPTION =
  'Where the data comes from, why the demo professors are fictional, and the exact formulas behind every rating, grade delta, badge, name match and AI summary.';

interface AboutData {
  meta: Meta | null;
  school: School | null;
  report: MatchReport | null;
  professors: Professor[];
}

async function loadAboutData(): Promise<AboutData> {
  const repo = getRepository();
  const [meta, school, report, professors] = await Promise.all([
    repo.getMeta(DEFAULT_SCHOOL_ID).catch(() => null),
    repo.getSchool(DEFAULT_SCHOOL_ID).catch(() => null),
    repo.getMatchReport(DEFAULT_SCHOOL_ID).catch(() => null),
    repo.getProfessors(DEFAULT_SCHOOL_ID).catch(() => [] as Professor[]),
  ]);
  return { meta, school, report, professors };
}

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await loadAboutData();
  const title = meta?.mode === 'demo' ? `${TITLE} · DEMO` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: { title, description: DESCRIPTION, url: `${SITE_URL}/about` },
  };
}

/** (model, count) for every OpenAI-compatible summary in summaries.json, most frequent first. */
async function modelCounts(): Promise<{ model: string; count: number }[]> {
  const cache = await loadSummaryCache(DEFAULT_SCHOOL_ID).catch(() => new Map());
  const counts = new Map<string, number>();
  for (const s of cache.values()) if (s.source === 'openai-compatible' && s.model) counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
  return [...counts.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count);
}

export default async function AboutPage() {
  const llmModels = await modelCounts();
  const { meta, school, report, professors } = await loadAboutData();
  const base = SCHOOL_REGISTRY[DEFAULT_SCHOOL_ID];
  const shortName = school?.shortName ?? base.shortName;
  const timezone = school?.timezone ?? base.timezone;
  const seatStatusAvailable = school?.seatStatusAvailable ?? true;
  const mode = meta?.mode ?? 'demo';
  const professorRefs: Record<string, ProfessorRef> = Object.fromEntries(
    professors.map((p) => [p.id, { slug: p.slug, displayName: p.displayName }]),
  );

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
            <WhatSection schoolShortName={shortName} />
          </AboutSection>

          <AboutSection id="sources">
            {meta ? (
              <SourcesSection meta={meta} timezone={timezone} />
            ) : (
              <p>Source details are unavailable until the dataset is built (<code>npm run data:all</code>).</p>
            )}
          </AboutSection>

          <AboutSection id="demo">
            <DemoSection mode={mode} edgeCases={meta?.edgeCases ?? []} />
          </AboutSection>

          <AboutSection id="scoring">
            <ScoringSection
              currentTerm={meta?.currentTerm ?? env.CURRENT_TERM}
              gradesThroughTerm={meta?.gradesThroughTerm ?? env.CURRENT_TERM}
              yearsBack={env.GRADE_YEARS_BACK}
            />
          </AboutSection>

          <AboutSection id="badges">
            <BadgeLegend seatStatusAvailable={seatStatusAvailable} />
          </AboutSection>

          <AboutSection id="matching">
            <p>
              Grade rows say <code>&quot;Last, First M&quot;</code>, the schedule says <code>&quot;Last, F&quot;</code>, and
              the review source has separate first and last names. The matcher normalizes all three (diacritics,
              hyphens, apostrophes, suffixes), then scores every candidate with the tiers below. It is{' '}
              <strong>conservative by design</strong>: an ambiguous match is <em>no</em> match, because a wrong join would
              attribute reviews to the wrong person.
            </p>
            <MatchTiersTable />
            <h3 className="text-base font-semibold text-ink">Coverage in this build</h3>
            {report ? (
              <>
                <CoverageStats report={report} schoolId={DEFAULT_SCHOOL_ID} />
                <h3 className="text-base font-semibold text-ink">Every instructor string and how it was resolved</h3>
                <MatchReportTable entries={report.entries} professors={professorRefs} schoolId={DEFAULT_SCHOOL_ID} />
              </>
            ) : (
              <p>No match report yet — run <code>npm run data:ingest</code>.</p>
            )}
          </AboutSection>

          <AboutSection id="ai">
            <AiSection
              model={env.ANTHROPIC_MODEL}
              claudeCount={meta?.counts.summariesClaude ?? 0}
              llmCount={meta?.counts.summariesOpenAiCompatible ?? 0}
              llmProvider={env.GROQ_PROVIDER_NAME}
              llmModel={env.GROQ_MODEL}
              llmModels={llmModels}
              extractiveCount={meta?.counts.summariesExtractive ?? 0}
            />
          </AboutSection>

          <AboutSection id="glossary">
            <Glossary />
          </AboutSection>

          <AboutSection id="limitations">
            <LimitationsSection seatStatusAvailable={seatStatusAvailable} />
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
