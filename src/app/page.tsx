import type { Metadata } from "next";
import { siteUrl } from "@/lib/config/env";
import { HeroForm } from "@/components/landing/HeroForm";
import type { SchoolOption } from "@/components/landing/SchoolSelect";
import type { SubjectOption } from "@/components/landing/SubjectCombobox";
import { StatsStrip, sumCounts } from "@/components/landing/StatsStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS, findSchoolConfig, getSchoolConfig } from "@/lib/config/schools";
import type { Meta, School, Subject } from "@/lib/domain/types";

const SITE_URL = siteUrl;
const TITLE = "ProfPeek — Find the professor, not just the course";
const DESCRIPTION =
  "Official grade curves — and student reviews where available — filtered to sections you can still get into this term.";

interface LandingSchool {
  id: string;
  school: School | null;
  subjects: Subject[];
  meta: Meta | null;
}

/** school.json + subjects.json + meta.json for every registered school; a missing dataset yields empty parts. */
async function loadLanding(): Promise<LandingSchool[]> {
  const repo = getRepository();
  return Promise.all(
    SCHOOL_IDS.map(async (id) => {
      const [school, subjects, meta] = await Promise.all([
        repo.getSchool(id).catch(() => null),
        repo.getSubjects(id).catch(() => [] as Subject[]),
        repo.getMeta(id).catch(() => null),
      ]);
      return { id, school, subjects, meta };
    }),
  );
}

/** Only schools whose dataset exists are listed (design §8); registry names fill in when school.json is absent but subjects exist. */
export function toSchoolOptions(loaded: readonly LandingSchool[]): SchoolOption[] {
  const out: SchoolOption[] = [];
  for (const { id, school, subjects, meta } of loaded) {
    if (subjects.length === 0 && !meta) continue;
    const base = findSchoolConfig(id);
    const flags = resolveSchoolFlags(school ?? { id, shortName: base?.shortName, sources: null }, meta ? { mode: meta.mode } : {});
    out.push({
      id,
      name: school?.name ?? base?.name ?? id,
      shortName: school?.shortName ?? base?.shortName ?? id.toUpperCase(),
      professorCount: meta?.counts.professors,
      subjectCount: subjects.length,
      reviewsAvailable: flags.reviewsAvailable,
      isDemo: flags.mode === "demo",
    });
  }
  return out;
}

export async function generateMetadata(): Promise<Metadata> {
  const loaded = await loadLanding();
  const modes = loaded.map((l) => l.meta?.mode).filter((m): m is Meta["mode"] => m != null);
  const demo = modes.length > 0 && modes.every((m) => m === "demo");
  const title = demo ? `${TITLE} · DEMO` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: new URL("/", SITE_URL).toString() },
    openGraph: { title, description: DESCRIPTION, url: "/" },
  };
}

export default async function LandingPage() {
  const loaded = await loadLanding();
  const options = toSchoolOptions(loaded);
  const fallbackConfig = getSchoolConfig(DEFAULT_SCHOOL_ID);
  const schoolOptions: SchoolOption[] =
    options.length > 0 ? options : [{ id: fallbackConfig.id, name: fallbackConfig.name, shortName: fallbackConfig.shortName }];
  const subjectsBySchool: Record<string, SubjectOption[]> = {};
  for (const l of loaded) subjectsBySchool[l.id] = l.subjects.map(({ code, name, professorCount }) => ({ code, name, professorCount }));
  const defaultSchoolId = schoolOptions.some((s) => s.id === DEFAULT_SCHOOL_ID) ? DEFAULT_SCHOOL_ID : schoolOptions[0].id;

  const withData = loaded.filter((l) => l.meta);
  const counts = sumCounts(withData.map((l) => l.meta?.counts));
  const seatStatusAvailable = withData.every((l) => l.school?.seatStatusAvailable ?? true);
  const reviewsAvailable = options.some((s) => s.reviewsAvailable !== false);

  return (
    <div className="flex flex-1 flex-col gap-10 pb-16">
      <HeroForm schools={schoolOptions} subjectsBySchool={subjectsBySchool} defaultSchoolId={defaultSchoolId} />
      {counts ? (
        <StatsStrip
          counts={counts}
          seatStatusAvailable={seatStatusAvailable}
          reviewsAvailable={reviewsAvailable}
          schoolCount={withData.length}
          className="px-4 sm:px-6"
        />
      ) : null}
      <HowItWorks />
    </div>
  );
}
