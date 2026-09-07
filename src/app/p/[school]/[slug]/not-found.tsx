import type { Metadata } from "next";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID, SCHOOL_IDS } from "@/lib/config/schools";
import { NotFoundSwitch } from "@/components/layout/NotFoundSwitch";
import type { SubjectOption } from "@/components/landing/SubjectCombobox";

export const metadata: Metadata = {
  title: "Professor not found · ProfPeek",
  robots: { index: false },
};

/**
 * Unknown professor slug (SPEC 3.0): a short message linking back to the subject lists of the school named
 * in the URL (design §8 keeps every path per school). `not-found.tsx` receives no params, so the subjects of
 * every registered school are loaded here and `NotFoundSwitch` picks the pathname's school on the client.
 */
export default async function ProfessorNotFound() {
  const repo = getRepository();
  const subjectsBySchool: Record<string, SubjectOption[]> = {};
  for (const school of SCHOOL_IDS) {
    const subjects = await repo.getSubjects(school).catch(() => []);
    subjectsBySchool[school] = subjects.map(({ code, name, professorCount }) => ({ code, name, professorCount }));
  }
  return <NotFoundSwitch subjectsBySchool={subjectsBySchool} defaultSchoolId={DEFAULT_SCHOOL_ID} />;
}
