// professors-detail/<SUBJECT>.json: slug → ProfessorDetail, school-wide scope (SPEC 6.6, 5 ProfessorDetail;
// MULTI_SCHOOL_DESIGN §3: split per subject — a professor appears in every subject file they are ranked in).
import type { ProfessorDetail, RankingsPayload, RankingsResponse } from '@/lib/domain/types';
import { eligibleRows, subjectWRate, type AggregateContext } from '@/lib/scoring/aggregate';
import { priorMean } from '@/lib/scoring/rating';
import { applyRankingsQuery, defaultSortFor } from '@/lib/scoring/rank';
import type { DataIndex, ProcessedData } from './load';
import { buildRankedProfessor } from './scores';

/** Default-sort, openOnly=false rank of every professor per subject payload (null when in lowData). */
export function rankIndex(payloads: readonly RankingsPayload[]): Map<string, { subject: string; rank: number | null }[]> {
  const out = new Map<string, { subject: string; rank: number | null }[]>();
  for (const payload of payloads) {
    const response: RankingsResponse = applyRankingsQuery(payload, { sort: defaultSortFor(payload.school), openOnly: false });
    const push = (pid: string, rank: number | null) => {
      const list = out.get(pid) ?? [];
      list.push({ subject: payload.subject.code, rank });
      out.set(pid, list);
    };
    for (const rp of response.ranked) push(rp.professor.id, rp.rank);
    for (const rp of response.lowData) push(rp.professor.id, null);
  }
  for (const list of out.values()) list.sort((a, b) => a.subject.localeCompare(b.subject));
  return out;
}

/** Every professor, school-wide scope, keyed by slug. */
export function buildProfessorDetails(data: ProcessedData, index: DataIndex, payloads: readonly RankingsPayload[]): Record<string, ProfessorDetail> {
  const ctx: AggregateContext = { allRows: data.grades, courses: data.courses, scope: { kind: 'school' } };
  const prior = priorMean(data.reviews);
  const eligible = eligibleRows(data.grades);
  const wRateBySubject = new Map<string, number | null>();
  const ranks = rankIndex(payloads);

  const out: Record<string, ProfessorDetail> = {};
  for (const professor of [...data.professors].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const gradedBySubject = new Map<string, number>();
    for (const row of eligible) {
      if (row.professorId !== professor.id) continue;
      const subj = row.courseId.split(':')[1] ?? '';
      gradedBySubject.set(subj, (gradedBySubject.get(subj) ?? 0) + row.graded);
    }
    const primarySubject = [...professor.subjects].sort((a, b) => (gradedBySubject.get(b) ?? 0) - (gradedBySubject.get(a) ?? 0) || a.localeCompare(b))[0];
    let wRate: number | null = null;
    if (primarySubject) {
      if (!wRateBySubject.has(primarySubject)) wRateBySubject.set(primarySubject, subjectWRate(eligible, primarySubject));
      wRate = wRateBySubject.get(primarySubject) ?? null;
    }
    const sections = index.sectionsByProfessor.get(professor.id) ?? [];
    const rp = buildRankedProfessor({ data, index, professorId: professor.id, ctx, sections, prior, subjectWRate: wRate });
    out[professor.slug] = {
      professor: rp.professor,
      scores: rp.scores,
      badges: rp.badges,
      vibeTags: rp.vibeTags,
      distribution: rp.distribution,
      gpaByYear: rp.gpaByYear,
      courses: rp.courses,
      sections: [...sections].sort((a, b) => a.crn.localeCompare(b.crn, undefined, { numeric: true })),
      reviews: index.reviewsByProfessor.get(professor.id) ?? [],
      summary: rp.summary,
      matchProvenance: rp.matchProvenance,
      rankBySubject: ranks.get(professor.id) ?? [],
    };
  }
  return out;
}

/**
 * Per-subject slices of the detail map: every professor on a subject's rankings payload gets an entry in
 * that subject's file (identical school-wide detail), so JsonRepository.getProfessorBySlug can read any one.
 */
export function splitDetailsBySubject(
  details: Readonly<Record<string, ProfessorDetail>>,
  payloads: readonly RankingsPayload[],
): Record<string, Record<string, ProfessorDetail>> {
  const out: Record<string, Record<string, ProfessorDetail>> = {};
  for (const payload of payloads) {
    const slice: Record<string, ProfessorDetail> = {};
    const slugs = payload.professors.map((rp) => rp.professor.slug).sort();
    for (const slug of slugs) {
      const detail = details[slug];
      if (detail) slice[slug] = detail;
    }
    out[payload.subject.code] = slice;
  }
  return out;
}
