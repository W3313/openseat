import type { Metadata } from "next";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS } from "@/lib/config/schools";
import { NotFoundSwitch } from "@/components/layout/NotFoundSwitch";
import type { SubjectOption } from "@/components/landing/SubjectCombobox";

export const metadata: Metadata = {
  title: "Page not found · ProfPeek",
  robots: { index: false },
};

/**
 * Root 404 (F13). Rankings, course and professor routes enumerate every valid path at build time,
 * so unknown ones arrive here with a genuine 404 status; `NotFoundSwitch` reads the pathname on the
 * client and shows subject suggestions, a course message, or the professor message accordingly.
 */
export default async function RootNotFound() {
  const repo = getRepository();
  const subjectsBySchool: Record<string, SubjectOption[]> = {};
  for (const school of SCHOOL_IDS) {
    const subjects = await repo.getSubjects(school).catch(() => []);
    subjectsBySchool[school] = subjects.map(({ code, name, professorCount }) => ({ code, name, professorCount }));
  }
  return <NotFoundSwitch subjectsBySchool={subjectsBySchool} defaultSchoolId={DEFAULT_SCHOOL_ID} />;
}
