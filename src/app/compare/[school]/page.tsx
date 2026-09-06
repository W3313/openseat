import type { Metadata } from "next";
import { siteUrl } from "@/lib/config/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ProfessorDetail, SchoolId } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { buildCompareHref, buildRankingsHref, parsePicks } from "@/lib/utils/urlState";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState } from "@/components/rankings/EmptyState";
import { ShareButton } from "@/components/rankings/ShareButton";
import { CompareTable } from "@/components/shortlist/CompareTable";
import { MAX_PICKS, MIN_COMPARE_PICKS } from "@/components/shortlist/storage";
import { orderBySlugs } from "@/components/shortlist/compareRows";

type Params = { school: string };
interface PageProps {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SITE_URL = siteUrl;

export async function generateStaticParams(): Promise<Params[]> {
  return SCHOOL_IDS.map((school) => ({ school }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { school } = await params;
  const schoolId = toSchoolId(school);
  const repo = getRepository();
  const meta = schoolId ? await repo.getMeta(schoolId).catch(() => null) : null;
  const title = meta?.mode === "demo" ? "Compare professors · ProfPeek · DEMO" : "Compare professors · ProfPeek";
  const canonical = new URL(buildCompareHref(schoolId ?? school, []), SITE_URL).toString();
  return {
    title,
    description: "Two or three professors side by side: shrunk rating, grades vs. course, withdrawal rate, badges, open sections and AI verdicts.",
    alternates: { canonical },
    robots: { index: false }, // query-driven page
  };
}

async function loadDetails(schoolId: SchoolId, slugs: readonly string[]): Promise<ProfessorDetail[]> {
  const repo = getRepository();
  const fetched = await Promise.all(slugs.map((slug) => repo.getProfessorBySlug(schoolId, slug).catch(() => null)));
  return orderBySlugs(fetched, slugs, MAX_PICKS);
}

/**
 * `/compare/[school]?p=a,b,c` (SPEC 3.5). Unknown slugs are dropped, not 404; fewer than two
 * resolvable professors renders an EmptyState linking back to the rankings.
 */
export default async function ComparePage({ params, searchParams }: PageProps) {
  const [{ school }, query] = await Promise.all([params, searchParams]);
  const schoolId = toSchoolId(school);
  if (!schoolId) notFound();

  const repo = getRepository();
  const schoolRecord = await repo.getSchool(schoolId).catch(() => null);
  if (!schoolRecord) notFound();

  const slugs = parsePicks(query, "p").slice(0, MAX_PICKS);
  const details = slugs.length ? await loadDetails(schoolId, slugs) : [];
  const dropped = slugs.filter((s) => !details.some((d) => d.professor.slug === s));
  const subjects = [...new Set(details.flatMap((d) => d.professor.subjects))];
  const backSubject = subjects[0];
  const backHref = backSubject ? buildRankingsHref(schoolId, backSubject) : "/";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <Breadcrumb items={[{ label: schoolRecord.shortName, href: "/" }, { label: "Compare" }]} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Compare professors</h1>
          {details.length >= MIN_COMPARE_PICKS ? <ShareButton className="shrink-0" /> : null}
        </div>
        <p className="m-0 text-sm text-ink-muted">
          Side by side, {MIN_COMPARE_PICKS}–{MAX_PICKS} at a time. The best value in each numeric row is highlighted; difficulty and W rate
          count lower as better.
        </p>
      </header>

      {details.length < MIN_COMPARE_PICKS ? (
        <EmptyState
          title={details.length === 0 ? "Pick two or three professors to compare" : "Pick one more professor to compare"}
          description={
            <>
              Use the bookmark button on any professor card or profile to add them to My picks, then open the drawer and press Compare.
              {dropped.length ? ` Unknown professors were skipped: ${dropped.join(", ")}.` : ""}
            </>
          }
          secondaryHref={backHref}
          secondaryLabel={backSubject ? `Back to ${backSubject} rankings` : "Back to the start"}
        />
      ) : (
        <>
          {dropped.length ? (
            <p role="status" className="m-0 text-xs text-ink-faint">
              Skipped unknown professors: {dropped.join(", ")}.
            </p>
          ) : null}
          <CompareTable details={details} school={schoolRecord} />
          <p className="m-0 text-sm">
            <Link href={backHref} className="font-medium text-link hover:underline">
              ← Back to {backSubject ?? "the"} rankings
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
