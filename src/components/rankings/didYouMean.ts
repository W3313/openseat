// "Did you mean" for unknown subject codes (SPEC 3.0 not-found): prefix or Levenshtein ≤ 2 over
// subjects.json, at most 5. Pure so the client not-found island and tests can share it.
import type { Subject } from "@/lib/domain/types";

export type SubjectLike = Pick<Subject, "code" | "name">;

/** Plain Levenshtein distance (small inputs only — subject codes are ≤ 5 chars). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

export const DID_YOU_MEAN_MAX = 5;
export const DID_YOU_MEAN_DISTANCE = 2;

/**
 * Ranked suggestions: exact prefix matches on the code first, then codes within
 * Levenshtein ≤ 2, then subjects whose name starts with the query word.
 */
export function didYouMeanSubjects<T extends SubjectLike>(query: string, subjects: readonly T[], max = DID_YOU_MEAN_MAX): T[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: { s: T; score: number }[] = [];
  for (const s of subjects) {
    const code = s.code.toUpperCase();
    if (code === q) continue; // an exact code would not be a 404
    let score: number | null = null;
    if (code.startsWith(q) || q.startsWith(code)) score = 0;
    else {
      const d = levenshtein(code, q);
      if (d <= DID_YOU_MEAN_DISTANCE) score = d;
      else if (s.name.toUpperCase().startsWith(q) || s.name.toUpperCase().split(/\s+/).some((w) => w.startsWith(q))) score = 3;
    }
    if (score !== null) scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score || a.s.code.localeCompare(b.s.code));
  return scored.slice(0, max).map((x) => x.s);
}
