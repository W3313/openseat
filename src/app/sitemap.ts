// SPEC 3.8 / F23: `/`, `/about`, every subject page, every course page, every professor page,
// read from subjects.json / courses.json / professors.json via the repository.
import type { MetadataRoute } from 'next';
import { SCHOOL_IDS } from '@/lib/config/schools';
import { getRepository } from '@/lib/repo';
import { buildCourseHref, buildProfessorHref, buildRankingsHref } from '@/lib/utils/urlState';
import { SITE_URL } from './robots';

type Entry = MetadataRoute.Sitemap[number];

function abs(path: string): string {
  return `${SITE_URL}${path}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = getRepository();
  const entries: Entry[] = [
    { url: abs('/'), changeFrequency: 'weekly', priority: 1 },
    { url: abs('/about'), changeFrequency: 'monthly', priority: 0.6 },
  ];

  for (const schoolId of SCHOOL_IDS) {
    let lastModified: Date | undefined;
    let demo = true;
    try {
      const meta = await repo.getMeta(schoolId);
      lastModified = new Date(meta.builtAt);
      demo = meta.mode === 'demo';
    } catch {
      lastModified = undefined;
    }
    const [subjects, courses, professors] = await Promise.all([
      repo.getSubjects(schoolId).catch(() => []),
      repo.getCourses(schoolId).catch(() => []),
      repo.getProfessors(schoolId).catch(() => []),
    ]);

    for (const s of subjects) {
      // buildRankingsHref omits default query values, so this is the bare canonical path.
      entries.push({ url: abs(buildRankingsHref(schoolId, s.code)), lastModified, changeFrequency: 'weekly', priority: 0.9 });
    }
    for (const c of courses) {
      entries.push({ url: abs(buildCourseHref(schoolId, c.subject, c.number)), lastModified, changeFrequency: 'weekly', priority: 0.7 });
    }
    // Fictional demo professors are noindex (see /p/[school]/[slug]/page.tsx) and are left out of the sitemap.
    for (const p of professors) {
      if (demo || p.isFictional) continue;
      entries.push({ url: abs(buildProfessorHref(schoolId, p.slug)), lastModified, changeFrequency: 'monthly', priority: 0.5 });
    }
  }
  return entries;
}
