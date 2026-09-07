import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Meta, RankingsPayload, SchoolId } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { env, siteUrl } from "@/lib/config/env";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { normalizeSubjectCode, buildRankingsHref } from "@/lib/utils/urlState";
import { RankingsHeader, rankingsDescription, rankingsTitle } from "@/components/rankings/RankingsHeader";
import { RankedList } from "@/components/rankings/RankedList";
import { CardSkeletonList } from "@/components/rankings/CardSkeleton";

type Params = { school: string; subject: string };
interface PageProps {
  params: Promise<Params>;
}

const SITE_URL = siteUrl;

/** Every subject with data, for every school (SPEC 3.0 static generation / F23). */
/** Every valid segment is enumerated above; anything else is a real 404 before any HTML streams (SPEC 3.0). */
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const repo = getRepository();
  const out: Params[] = [];
  for (const school of SCHOOL_IDS) {
    const subjects = await repo.getSubjects(school).catch(() => []);
    for (const s of subjects) out.push({ school, subject: s.code });
  }
  return out;
}

/** Resolve the route segments to a payload; null when either segment is unknown. */
async function loadPayload(params: Params): Promise<{ schoolId: SchoolId; code: string; payload: RankingsPayload | null; meta: Meta | null } | null> {
  const schoolId = toSchoolId(params.school);
  const code = normalizeSubjectCode(params.subject);
  if (!schoolId || !code) return null;
  const repo = getRepository();
  const [payload, meta] = await Promise.all([
    repo.getRankingsPayload(schoolId, code).catch(() => null),
    repo.getMeta(schoolId).catch(() => null),
  ]);
  return { schoolId, code, payload, meta };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const p = await params;
  const loaded = await loadPayload(p);
  if (!loaded?.payload) return { title: "Subject not found · ProfPeek", robots: { index: false } };
  const { payload, schoolId, code } = loaded;
  const title = rankingsTitle(payload);
  const description = rankingsDescription(payload);
  const canonical = new URL(buildRankingsHref(schoolId, code), SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RankingsPage({ params }: PageProps) {
  const p = await params;
  const schoolId = toSchoolId(p.school);
  const code = normalizeSubjectCode(p.subject);
  if (!schoolId || !code) notFound();

  const loaded = await loadPayload({ school: schoolId, subject: code });
  if (!loaded?.payload) notFound();
  const { payload, meta } = loaded;
  const yearsBack = env.GRADE_YEARS_BACK;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
      <RankingsHeader
        school={payload.school}
        subject={payload.subject}
        term={payload.term}
        mode={payload.mode}
        seatsFetchedAt={payload.seatsFetchedAt}
        gradesThroughTerm={payload.gradesThroughTerm}
        termFallback={payload.termFallback}
        scheduleTerm={meta?.scheduleTerm}
        yearsBack={yearsBack}
      />
      <Suspense fallback={<CardSkeletonList count={6} />}>
        <RankedList payload={payload} yearsBack={yearsBack} />
      </Suspense>
    </div>
  );
}
