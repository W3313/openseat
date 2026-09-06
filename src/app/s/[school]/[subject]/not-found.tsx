import type { Metadata } from "next";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS } from "@/lib/config/schools";
import { SubjectNotFound } from "@/components/rankings/SubjectNotFound";
import type { SubjectOption } from "@/components/landing/SubjectCombobox";

export const metadata: Metadata = {
  title: "Subject not found · ProfPeek",
  robots: { index: false },
};

/**
 * "No data for {subject}" + up to 5 did-you-mean subjects + the combobox
 * (SPEC 3.0). The subject code itself is read client-side from the pathname,
 * because `not-found.tsx` receives no params.
 */
export default async function SubjectNotFoundPage() {
  const repo = getRepository();
  const subjectsBySchool: Record<string, SubjectOption[]> = {};
  for (const school of SCHOOL_IDS) {
    const subjects = await repo.getSubjects(school).catch(() => []);
    subjectsBySchool[school] = subjects.map(({ code, name, professorCount }) => ({ code, name, professorCount }));
  }
  return <SubjectNotFound subjectsBySchool={subjectsBySchool} defaultSchoolId={DEFAULT_SCHOOL_ID} />;
}
