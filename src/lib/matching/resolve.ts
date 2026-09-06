// SPEC 7.4 — scoped, memoized resolution. Alias wins first; ambiguity stops the widening search.
import type { NameKey, Professor } from '@/lib/domain/types';
import { MATCH_ACCEPT, MATCH_ACCEPT_SCHOOL_WIDE, MATCH_MARGIN } from '@/lib/domain/constants';
import type { MatchCandidate, MatchScope, Resolution } from './types';
import { parseName } from './parseName';
import { score } from './score';

export const MAX_REPORTED_CANDIDATES = 3;

type ScopeKind = 'course' | 'subject' | 'school';

interface ScopeStep {
  kind: ScopeKind;
  threshold: number;
  filter: (p: Professor) => boolean;
}

/**
 * Memo keyed by (schoolId, source, instructorRaw) as SPEC 7 requires, extended with the scope's subject and
 * course ids: the same raw string in a different subject/course must be allowed to resolve differently
 * (widening a CS resolution onto ECE rows would be exactly the wrong join the matcher is built to avoid).
 */
const memo = new Map<string, Resolution>();

function memoKey(key: NameKey, scope: MatchScope): string {
  const courses = scope.courseIds ? [...scope.courseIds].sort().join(',') : '';
  return `${scope.schoolId}|${scope.source}|${key.raw}|${scope.subject}|${courses}`;
}

/** Drop the (schoolId, source, instructorRaw) memo — tests and re-ingest. */
export function clearMatchMemo(): void {
  memo.clear();
}

/** Number of memoized resolutions (diagnostics / tests). */
export function matchMemoSize(): number {
  return memo.size;
}

function scopeSteps(scope: MatchScope): ScopeStep[] {
  const steps: ScopeStep[] = [];
  const courseIds = scope.courseIds ?? [];
  if (scope.source === 'schedule' && courseIds.length > 0) {
    const wanted = new Set(courseIds);
    steps.push({
      kind: 'course',
      threshold: MATCH_ACCEPT,
      filter: (p) => p.courseIds.some((c) => wanted.has(c)),
    });
  }
  steps.push({ kind: 'subject', threshold: MATCH_ACCEPT, filter: (p) => p.subjects.includes(scope.subject) });
  steps.push({ kind: 'school', threshold: MATCH_ACCEPT_SCHOOL_WIDE, filter: () => true });
  return steps;
}

/** Score every in-scope candidate, keep the best per professorId, sort by score desc then id asc. */
function rankCandidates(key: NameKey, candidates: readonly Professor[], scope: MatchScope, step: ScopeStep): MatchCandidate[] {
  const best = new Map<string, MatchCandidate>();
  for (const p of candidates) {
    if (p.schoolId !== scope.schoolId) continue;
    if (!step.filter(p)) continue;
    const s = score(key, p);
    if (s.score <= 0) continue;
    const prev = best.get(p.id);
    if (!prev || s.score > prev.score) best.set(p.id, { professorId: p.id, score: s.score, method: s.method });
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.professorId < b.professorId ? -1 : a.professorId > b.professorId ? 1 : 0));
}

function top(list: readonly MatchCandidate[]): MatchCandidate[] {
  return list.slice(0, MAX_REPORTED_CANDIDATES).map((c) => ({ ...c }));
}

function compute(key: NameKey, candidates: readonly Professor[], scope: MatchScope): Resolution {
  // T0 — alias override on the exact raw string (also tolerate the untrimmed original).
  const aliasId = scope.aliases?.[key.raw] ?? scope.aliases?.[key.raw.trim()];
  if (aliasId) {
    return { professorId: aliasId, method: 'alias', score: 1, candidates: [{ professorId: aliasId, score: 1, method: 'alias' }] };
  }

  let widest: MatchCandidate[] = [];
  for (const step of scopeSteps(scope)) {
    const ranked = rankCandidates(key, candidates, scope, step);
    if (ranked.length > widest.length || step.kind === 'school') widest = ranked;
    if (ranked.length === 0) continue;
    const best = ranked[0];
    const second = ranked[1]?.score ?? 0;
    if (best.score < step.threshold) continue;
    if (best.score - second >= MATCH_MARGIN - 1e-9) {
      return { professorId: best.professorId, method: best.method, score: best.score, candidates: top(ranked) };
    }
    // Accepted score but no clear winner: ambiguity stops the search.
    return { professorId: null, method: 'ambiguous', score: best.score, candidates: top(ranked) };
  }
  return { professorId: null, method: 'unmatched', score: widest[0]?.score ?? 0, candidates: top(widest) };
}

/** SPEC 7.4 scoped, memoized resolution. Ambiguity stops the search; alias wins first. */
export function resolve(key: NameKey, candidates: readonly Professor[], scope: MatchScope): Resolution {
  const k = memoKey(key, scope);
  const hit = memo.get(k);
  if (hit) return cloneResolution(hit);
  const result = compute(key, candidates, scope);
  memo.set(k, result);
  return cloneResolution(result);
}

/** Convenience for ingest: parse + resolve in one call; blocked strings yield method 'blocked'. */
export function resolveRaw(raw: string, candidates: readonly Professor[], scope: MatchScope): Resolution {
  const key = parseName(raw);
  if (key === null) return { professorId: null, method: 'blocked', score: 0, candidates: [] };
  return resolve(key, candidates, scope);
}

function cloneResolution(r: Resolution): Resolution {
  return { ...r, candidates: r.candidates.map((c) => ({ ...c })) };
}
