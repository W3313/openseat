import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Meta, ProfessorDetail, School, SchoolId } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { env, siteUrl } from "@/lib/config/env";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { buildProfessorHref } from "@/lib/utils/urlState";
import { isSlug } from "@/lib/utils/slug";
import { gradedCountText } from "@/lib/copy/tooltips";
import { GradeBar } from "@/components/charts/GradeBar";
import { GpaTrendChart } from "@/components/charts/GpaTrendChart";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";
import { ProfileHeader, profileTitle } from "@/components/professor/ProfileHeader";
import { StatsGrid } from "@/components/professor/StatsGrid";
import { CourseBreakdownTable } from "@/components/professor/CourseBreakdownTable";
import { SectionsTable } from "@/components/professor/SectionsTable";
import { AISummaryPanel } from "@/components/professor/AISummaryPanel";
import { ReviewList } from "@/components/professor/ReviewList";
import { MatchProvenance } from "@/components/professor/MatchProvenance";

type Params = { school: string; slug: string };
interface PageProps {
  params: Promise<Params>;
}

const SITE_URL = siteUrl;

/**
 * Professor pages (SPEC 3.0 / F23, MULTI_SCHOOL_DESIGN §6). Six schools hold ≈ 9,000 professors, well past the
 * ~3,000-pages-per-build cap, so the design's fallback is in force: an even per-school share of the first
 * MAX_STATIC_PROFESSOR_PAGES professors is prerendered, every other valid slug renders on first request and
 * is cached for a day (ISR), and an unknown slug still 404s (load() → notFound()). See README "Deploying".
 */
export const dynamicParams = true;
export const revalidate = 86400;

const MAX_STATIC_PROFESSOR_PAGES = 3000;

export async function generateStaticParams(): Promise<Params[]> {
  const repo = getRepository();
  const perSchool = await Promise.all(
    SCHOOL_IDS.map(async (school) => ({ school, slugs: (await repo.getProfessors(school).catch(() => [])).map((p) => p.slug) })),
  );
  const total = perSchool.reduce((n, s) => n + s.slugs.length, 0);
  const quota = total <= MAX_STATIC_PROFESSOR_PAGES ? Infinity : Math.floor(MAX_STATIC_PROFESSOR_PAGES / Math.max(1, perSchool.length));
  const out: Params[] = [];
  for (const { school, slugs } of perSchool) {
    for (const slug of slugs.slice(0, quota)) out.push({ school, slug });
  }
  return out;
}

interface Loaded {
  schoolId: SchoolId;
  slug: string;
  detail: ProfessorDetail | null;
  school: School | null;
  meta: Meta | null;
}

async function load(params: Params): Promise<Loaded | null> {
  const schoolId = toSchoolId(params.school);
  const slug = params.slug.toLowerCase();
  if (!schoolId || !isSlug(slug)) return null;
  const repo = getRepository();
  const [detail, school, meta] = await Promise.all([
    repo.getProfessorBySlug(schoolId, slug).catch(() => null),
    repo.getSchool(schoolId).catch(() => null),
    repo.getMeta(schoolId).catch(() => null),
  ]);
  return { schoolId, slug, detail, school, meta };
}

/** Prefix for search snippets / unfurls of fictional demo professors, so a fabricated rating is never read as a real one. */
export const FICTIONAL_DESCRIPTION_PREFIX = "Fictional demo instructor — ";

/**
 * ≤ 155 chars: "Adaeze Okonkwo (CS): 4.6★ from 23 reviews, GPA 3.41, −0.09 vs course. Grade curves, sections and an AI summary."
 * Grades-only schools omit the rating and the AI summary clause. Demo-mode / fictional professors are prefixed.
 */
export function profileDescription(detail: ProfessorDetail, demo = detail.professor.isFictional, reviewsAvailable = true): string {
  const { professor, scores } = detail;
  const bits: string[] = [];
  if (reviewsAvailable && scores.ratingShrunk != null) bits.push(`${scores.ratingShrunk.toFixed(1)}★ from ${scores.reviewCount} reviews`);
  if (scores.gpaMean != null) bits.push(`GPA ${scores.gpaMean.toFixed(2)}`);
  if (scores.gpaDelta != null) bits.push(`${scores.gpaDelta >= 0 ? "+" : "−"}${Math.abs(scores.gpaDelta).toFixed(2)} vs course`);
  const lead = `${professor.displayName} (${professor.subjects.join("/")})${bits.length ? `: ${bits.join(", ")}` : ""}.`;
  const prefix = demo ? FICTIONAL_DESCRIPTION_PREFIX : "";
  const tail = reviewsAvailable ? "Grade curves, sections this term and an AI summary." : "Official grade curves and sections this term.";
  return `${prefix}${lead} ${tail}`.slice(0, 155);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const loaded = await load(await params);
  // Throw here, not only in the page body: loading.tsx streams the shell first, so a notFound() raised later
  // could no longer turn the (ISR-rendered) response into a real 404 status.
  if (!loaded?.detail || !loaded.school) notFound();
  const { detail, schoolId, meta, school } = loaded;
  const demo = meta?.mode === "demo" || detail.professor.isFictional;
  const reviewsAvailable = school ? resolveSchoolFlags(school, meta ? { mode: meta.mode } : {}).reviewsAvailable : true;
  const title = profileTitle(detail, demo);
  const description = profileDescription(detail, demo, reviewsAvailable);
  const canonical = new URL(buildProfessorHref(schoolId, detail.professor.slug), SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "profile" },
    twitter: { card: "summary", title, description },
    // Fictional profiles carry real-sounding names; keep them out of search indexes (the in-page captions,
    // the title suffix and the OG watermark still label them as demo for anyone who follows a link).
    ...(demo ? { robots: { index: false, follow: true } } : {}),
  };
}

/** `/p/[school]/[slug]` — the eight blocks of SPEC 3.4 (six for a grades-only school, design §5). */
export default async function ProfessorPage({ params }: PageProps) {
  const p = await params;
  const schoolId = toSchoolId(p.school);
  const slug = p.slug.toLowerCase();
  if (!schoolId || !isSlug(slug)) notFound();

  const loaded = await load({ school: schoolId, slug });
  if (!loaded?.detail || !loaded.school) notFound();
  const { detail, school, meta } = loaded;
  const { professor, scores } = detail;
  const yearsBack = env.GRADE_YEARS_BACK;
  const flags = resolveSchoolFlags(school, meta ? { mode: meta.mode } : {});
  const { reviewsAvailable, gradeValueKind, gradeBuckets } = flags;

  const repo = getRepository();
  const primarySubject = professor.subjects[0];
  const [professors, payload] = await Promise.all([
    repo.getProfessors(schoolId).catch(() => []),
    primarySubject ? repo.getRankingsPayload(schoolId, primarySubject).catch(() => null) : Promise.resolve(null),
  ]);
  const names: Record<string, string> = {};
  for (const other of professors) names[other.id] = other.displayName;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <ProfileHeader detail={detail} school={school} backSubject={primarySubject} />

      <StatsGrid scores={scores} yearsBack={yearsBack} reviewsAvailable={reviewsAvailable} gradeValueKind={gradeValueKind} />

      <section aria-labelledby="grades-heading" className="flex flex-col gap-3">
        <h2 id="grades-heading" className="m-0 text-base font-semibold text-ink">
          Grade distribution
        </h2>
        {scores.studentsGraded > 0 ? (
          <div className="rounded-card border border-border bg-surface-raised p-4">
            <GradeBar buckets={detail.distribution} height={28} legend focusable bucketKind={gradeBuckets} valueKind={gradeValueKind} subject={professor.displayName} />
            <p className="m-0 mt-2 text-xs text-ink-muted">
              All lecture-type grade rows in the last {yearsBack} years ({gradedCountText(scores, gradeValueKind)}
              {gradeValueKind === "percent" ? "; each section scaled to 100 students" : `, ${scores.gradeRows} rows`}).
            </p>
          </div>
        ) : (
          <p className="m-0 rounded-card border border-dashed border-border p-4 text-sm text-ink-muted">
            New — no grade data yet. The grade dataset lags the schedule, so this instructor has no lecture rows in the window.
          </p>
        )}
        <GpaTrendChart points={detail.gpaByYear} range={payload?.sparklineRange} subject={professor.displayName} />
      </section>

      <CourseBreakdownTable courses={detail.courses} schoolId={schoolId} gradeValueKind={gradeValueKind} bucketKind={gradeBuckets} />

      <SectionsTable
        sections={detail.sections}
        timezone={school.timezone}
        seatStatusAvailable={school.seatStatusAvailable}
        professorId={professor.id}
        professorNames={names}
      />

      {reviewsAvailable ? (
        <>
          <div id="summary">
            <AISummaryPanel summary={detail.summary} variant="full" timezone={school.timezone} />
          </div>

          <ReviewList reviews={detail.reviews} evidenceReviewIds={detail.summary?.evidenceReviewIds ?? []} />
        </>
      ) : null}

      <MatchProvenance provenance={detail.matchProvenance} />
    </div>
  );
}
