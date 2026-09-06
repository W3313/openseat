// SPEC 7.3 — tier scoring. Evaluated top to bottom; first hit wins; 0 otherwise.
import type { NameKey, Professor } from '@/lib/domain/types';
import type { ScoreResult } from './types';
import { damerauLevenshtein } from './damerau';
import { areNicknames } from './nicknames';

export const TIER_SCORES = {
  alias: 1.0,
  exact: 1.0,
  'first-token': 0.95,
  initial: 0.85,
  nickname: 0.85,
  'compound-last': 0.8,
  fuzzy: 0.75,
} as const;

export const MIDDLE_INITIAL_PENALTY = 0.5;
const COMPOUND_MIN_LEN = 4;
const FUZZY_MIN_LEN = 6;

/** T1: same full first (incl. middle tokens) or the same hyphen-collapsed first ("hua hua" == "huahua"). */
export function firstExact(k: NameKey, p: NameKey): boolean {
  return k.first !== '' && (k.first === p.first || k.firstCompact === p.firstCompact);
}

/** T2: same first token, both at least two letters (so initials never count as tokens). */
export function firstTokenEq(k: NameKey, p: NameKey): boolean {
  return k.firstToken.length >= 2 && p.firstToken.length >= 2 && k.firstToken === p.firstToken;
}

/** T3: one side is an initial and the initials agree. */
export function initialEq(k: NameKey, p: NameKey): boolean {
  return (
    k.firstInitial !== '' &&
    (k.firstToken.length === 1 || p.firstToken.length === 1) &&
    k.firstInitial === p.firstInitial
  );
}

/** T5 surname test: shared final token, or one compact surname is a prefix/suffix of the other (shorter ≥ 4). */
export function compoundLastEq(k: NameKey, p: NameKey): boolean {
  const kLast = k.lastTokens.at(-1);
  const pLast = p.lastTokens.at(-1);
  if (kLast !== undefined && pLast !== undefined && kLast === pLast) return true;
  const a = k.lastCompact;
  const b = p.lastCompact;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < COMPOUND_MIN_LEN) return false;
  return long.startsWith(short) || long.endsWith(short);
}

/** T6 surname test: one edit (incl. adjacent transposition) apart and both at least six letters. */
export function fuzzyLastEq(k: NameKey, p: NameKey): boolean {
  if (Math.min(k.lastCompact.length, p.lastCompact.length) < FUZZY_MIN_LEN) return false;
  return damerauLevenshtein(k.lastCompact, p.lastCompact) === 1;
}

function applyMiddleInitialPenalty(result: ScoreResult, k: NameKey, p: NameKey): ScoreResult {
  if (k.middleInitials.length > 0 && p.middleInitials.length > 0 && k.middleInitials[0] !== p.middleInitials[0]) {
    return { score: result.score * MIDDLE_INITIAL_PENALTY, method: result.method };
  }
  return result;
}

/** Score a key against a NameKey directly (used by `score` and by tests). */
export function scoreKeys(k: NameKey, p: NameKey): ScoreResult {
  const none: ScoreResult = { score: 0, method: 'unmatched' };
  // Last-name-only strings never match (SPEC 7.3).
  if (k.first === '' || k.lastCompact === '' || p.lastCompact === '') return none;

  const lastEq = k.lastCompact === p.lastCompact;
  let hit: ScoreResult | null = null;

  if (lastEq) {
    if (firstExact(k, p)) hit = { score: TIER_SCORES.exact, method: 'exact' };
    else if (firstTokenEq(k, p)) hit = { score: TIER_SCORES['first-token'], method: 'first-token' };
    else if (initialEq(k, p)) hit = { score: TIER_SCORES.initial, method: 'initial' };
    else if (areNicknames(k.firstToken, p.firstToken)) hit = { score: TIER_SCORES.nickname, method: 'nickname' };
  } else if (firstExact(k, p) || firstTokenEq(k, p)) {
    if (compoundLastEq(k, p)) hit = { score: TIER_SCORES['compound-last'], method: 'compound-last' };
    else if (fuzzyLastEq(k, p)) hit = { score: TIER_SCORES.fuzzy, method: 'fuzzy' };
  }

  if (hit === null) return none;
  return applyMiddleInitialPenalty(hit, k, p);
}

/** SPEC 7.3 tiers T1–T6 with the middle-initial penalty; { score: 0, method: 'unmatched' } when nothing hits. */
export function score(key: NameKey, professor: Professor): ScoreResult {
  return scoreKeys(key, professor.nameKey);
}
