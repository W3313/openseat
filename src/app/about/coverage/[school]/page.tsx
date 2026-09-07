// /about/coverage/<school> — the full instructor-string match report of one school (SPEC 3.6 / F21).
// Split out of /about so the methodology page no longer ships every school's entries (4+ MB of HTML);
// /about keeps the CoverageStats totals and links here.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { resolveSchoolFlags } from '@/components/layout/schoolFlags';
import { CoverageStats, MatchReportTable, type ProfessorRef } from '@/components/about';
import { SCHOOL_IDS, findSchoolConfig, toSchoolId } from '@/lib/config/schools';
import type { Professor } from '@/lib/domain/types';
import { getRepository } from '@/lib/repo';

type Params = { school: string };

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  return SCHOOL_IDS.map((school) => ({ school }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { school } = await params;
  const id = toSchoolId(school);
  const label = (id && findSchoolConfig(id)?.shortName) ?? school.toUpperCase();
  return { title: `Match report · ${label} · ProfPeek`, robots: { index: false } };
}

export default async function CoveragePage({ params }: { params: Promise<Params> }) {
  const { school } = await params;
  const id = toSchoolId(school);
  if (!id) notFound();
  const repo = getRepository();
  const [report, schoolRecord, meta, professors] = await Promise.all([
    repo.getMatchReport(id).catch(() => null),
    repo.getSchool(id).catch(() => null),
    repo.getMeta(id).catch(() => null),
    repo.getProfessors(id).catch(() => [] as Professor[]),
  ]);
  if (!report) notFound();
  const config = findSchoolConfig(id);
  const label = schoolRecord?.shortName ?? config?.shortName ?? id.toUpperCase();
  const flags = resolveSchoolFlags(schoolRecord ?? { id, shortName: label, sources: null, mode: config?.mode }, meta ? { mode: meta.mode } : {});
  const professorRefs: Record<string, ProfessorRef> = Object.fromEntries(professors.map((p) => [p.id, { slug: p.slug, displayName: p.displayName }]));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'About', href: '/about#matching' }, { label: `Match report · ${label}` }]} />
      <header className="mt-4 mb-6 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Instructor-string match report — {label}</h1>
        <p className="max-w-3xl text-base text-ink-muted">
          Every distinct instructor string in the {label} grade and schedule sources, how the matcher resolved it, and to whom.
          The tiers and the conservative-by-design rule are explained on{' '}
          <Link href="/about#matching" className="text-link underline underline-offset-2">the methodology page</Link>.
        </p>
      </header>
      <CoverageStats report={report} schoolId={id} reviewsAvailable={flags.reviewsAvailable} className="mb-6" />
      <MatchReportTable entries={report.entries} professors={professorRefs} schoolId={id} />
    </div>
  );
}
