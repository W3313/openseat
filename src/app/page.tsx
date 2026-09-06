import type { Metadata } from "next";
import { siteUrl } from "@/lib/config/env";
import { HeroForm } from "@/components/landing/HeroForm";
import { PopularSubjectChips } from "@/components/landing/PopularSubjectChips";
import { StatsStrip } from "@/components/landing/StatsStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { getRepository } from "@/lib/repo";
import type { Meta, School, SchoolId, Subject } from "@/lib/domain/types";

/** Only school in this build; the landing form still renders a select over `getSchools()`. */
const DEFAULT_SCHOOL: SchoolId = "uiuc";
const SITE_URL = siteUrl;
const TITLE = "ProfPeek — Find the professor, not just the course";
const DESCRIPTION =
  "Official grade curves + student reviews, filtered to sections you can still get into this term.";

interface LandingData {
  schools: School[];
  subjects: Subject[];
  meta: Meta | null;
  school: School | null;
}

async function loadLanding(): Promise<LandingData> {
  const repo = getRepository();
  const [schools, subjects, meta, school] = await Promise.all([
    repo.getSchools().catch(() => [] as School[]),
    repo.getSubjects(DEFAULT_SCHOOL).catch(() => [] as Subject[]),
    repo.getMeta(DEFAULT_SCHOOL).catch(() => null),
    repo.getSchool(DEFAULT_SCHOOL).catch(() => null),
  ]);
  return { schools, subjects, meta, school };
}

export async function generateMetadata(): Promise<Metadata> {
  let demo = true;
  try {
    demo = (await getRepository().getMeta(DEFAULT_SCHOOL)).mode === "demo";
  } catch {
    /* default to demo suffix */
  }
  const title = demo ? `${TITLE} · DEMO` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: new URL("/", SITE_URL).toString() },
    openGraph: { title, description: DESCRIPTION, url: "/" },
  };
}

export default async function LandingPage() {
  const { schools, subjects, meta, school } = await loadLanding();
  const schoolOptions =
    schools.length > 0
      ? schools
      : [{ id: DEFAULT_SCHOOL, name: "University of Illinois Urbana-Champaign", shortName: "UIUC" }];
  const subjectOptions = subjects.map(({ code, name, professorCount }) => ({ code, name, professorCount }));

  return (
    <div className="flex flex-1 flex-col gap-10 pb-16">
      <HeroForm schools={schoolOptions} subjects={subjectOptions} defaultSchoolId={DEFAULT_SCHOOL} />
      <PopularSubjectChips schoolId={DEFAULT_SCHOOL} subjects={subjectOptions} className="-mt-4" />
      {meta ? (
        <StatsStrip
          counts={meta.counts}
          seatStatusAvailable={school?.seatStatusAvailable ?? true}
          className="px-4 sm:px-6"
        />
      ) : null}
      <HowItWorks />
    </div>
  );
}
