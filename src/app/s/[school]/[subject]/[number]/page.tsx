import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Course, Meta, RankingsPayload, SchoolId } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { env, siteUrl } from "@/lib/config/env";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { buildCourseHref, normalizeCourseNumber, normalizeSubjectCode } from "@/lib/utils/urlState";
import { makeCourseId } from "@/lib/utils/ids";
import { RankingsHeader } from "@/components/rankings/RankingsHeader";
import { RankedList } from "@/components/rankings/RankedList";
import { CardSkeletonList } from "@/components/rankings/CardSkeleton";
import { GradeBar } from "@/components/charts/GradeBar";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";
import { courseSummaryLine, scopePayloadToCourse } from "./courseScope";

type Params = { school: string; subject: string; number: string };
interface PageProps {
  params: Promise<Params>;
}

const SITE_URL = siteUrl;

/** Every course in courses.json, for every school (SPEC 3.3). */
/** Every valid segment is enumerated above; anything else is a real 404 before any HTML streams (SPEC 3.0). */
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const repo = getRepository();
  const out: Params[] = [];
  for (const school of SCHOOL_IDS) {
    const courses = await repo.getCourses(school).catch(() => []);
    for (const c of courses) out.push({ school, subject: c.subject, number: c.number });
  }
  return out;
}

interface Loaded {
  schoolId: SchoolId;
  code: string;
  number: string;
  course: Course | null;
  payload: RankingsPayload | null;
  meta: Meta | null;
}

async function load(params: Params): Promise<Loaded | null> {
  const schoolId = toSchoolId(params.school);
  const code = normalizeSubjectCode(params.subject);
  const number = normalizeCourseNumber(params.number);
  if (!schoolId || !code || !number) return null;
  const repo = getRepository();
  const courseId = makeCourseId(schoolId, code, number);
  const [courses, payload, meta] = await Promise.all([
    repo.getCourses(schoolId, code).catch(() => [] as Course[]),
    repo.getRankingsPayload(schoolId, code).catch(() => null),
    repo.getMeta(schoolId).catch(() => null),
  ]);
  return { schoolId, code, number, course: courses.find((c) => c.id === courseId) ?? null, payload, meta };
}

/** "CS 225 Data Structures — who to take it with · ProfPeek" (+ " · DEMO"). */
export function courseTitle(course: Pick<Course, "subject" | "number" | "title">, demo: boolean): string {
  const base = `${course.subject} ${course.number} ${course.title} — who to take it with · ProfPeek`;
  return demo ? `${base} · DEMO` : base;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const loaded = await load(await params);
  if (!loaded?.course || !loaded.payload) return { title: "Course not found · ProfPeek", robots: { index: false } };
  const { course, payload, schoolId, code, number, meta } = loaded;
  const title = courseTitle(course, meta?.mode === "demo");
  const rankedBy = resolveSchoolFlags(payload.school, { mode: payload.mode }).reviewsAvailable ? "student rating" : "grade curve";
  const description = `Every instructor of ${code} ${number} (${course.title}) at ${payload.school.shortName}, ranked by ${rankedBy}, with grades compared against this course only.`.slice(
    0,
    155,
  );
  const canonical = new URL(buildCourseHref(schoolId, code, number), SITE_URL).toString();
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** `/s/[school]/[subject]/[number]` — course view (SPEC 3.3 / F20): RankedList scoped to one course. */
export default async function CoursePage({ params }: PageProps) {
  const p = await params;
  const schoolId = toSchoolId(p.school);
  const code = normalizeSubjectCode(p.subject);
  const number = normalizeCourseNumber(p.number);
  if (!schoolId || !code || !number) notFound();

  const loaded = await load({ school: schoolId, subject: code, number });
  if (!loaded?.course || !loaded.payload) notFound();
  const { course, payload, meta } = loaded;
  const scoped = scopePayloadToCourse(payload, number);
  const heading = `${code} ${number} — ${course.title}`;
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
        heading={heading}
      />

      <section aria-labelledby="course-grades-heading" className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="course-grades-heading" className="m-0 text-sm font-semibold text-ink">
            Course-wide grades, all instructors
          </h2>
          <span className="text-xs text-ink-muted">{courseSummaryLine(course)}</span>
        </div>
        <GradeBar buckets={course.buckets} height={20} legend focusable bucketKind={payload.school.gradeBuckets} valueKind={payload.school.gradeValueKind} subject={`${code} ${number}, all instructors`} />
        <p className="m-0 text-xs text-ink-faint">Each professor&apos;s Δ below is measured against this course only (others who taught it in the window).</p>
      </section>

      <Suspense fallback={<CardSkeletonList count={6} />}>
        <RankedList payload={scoped} yearsBack={yearsBack} showCourseChips={false} />
      </Suspense>
    </div>
  );
}
