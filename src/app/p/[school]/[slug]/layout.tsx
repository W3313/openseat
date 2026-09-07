import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { toSchoolId } from "@/lib/config/schools";
import { getRepository } from "@/lib/repo";
import { isSlug } from "@/lib/utils/slug";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ school: string; slug: string }>;
}

/**
 * Segment guard for the ISR professor route (design §6). The page sits behind loading.tsx, and Next 16 streams
 * both the shell and the metadata before the page resolves, so a notFound() raised inside the page (or in
 * generateMetadata, for non-bot user agents) can no longer change the already-sent 200. Layouts render before
 * that boundary, so validating the slug here turns an unknown professor into a real 404 — the same behaviour
 * the route had while every slug was enumerated with `dynamicParams = false`. professors.json is cached per
 * school by the repository, so this costs one in-memory lookup per request.
 */
export default async function ProfessorLayout({ children, params }: LayoutProps) {
  const { school, slug } = await params;
  const schoolId = toSchoolId(school);
  const lower = slug.toLowerCase();
  if (!schoolId || !isSlug(lower)) notFound();
  const professors = await getRepository().getProfessors(schoolId).catch(() => []);
  if (!professors.some((p) => p.slug === lower)) notFound();
  return children;
}
