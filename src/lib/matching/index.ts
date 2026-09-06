// Instructor name matching (SPEC section 7). Pure, deterministic, memoized by (schoolId, source, instructorRaw[, scope]).
// Public contract: the exported names/signatures below are what ingest, scoring and the UI import.
export type { MatchSource, MatchCandidate, Resolution, MatchScope, ScoreResult } from './types';

export { normalize, PARTICLES } from './normalize';
export {
  parseName,
  nameKeyFromFields,
  buildNameKey,
  isBlocked,
  gradesOnlyMergeKey,
  displayNameFromRaw,
} from './parseName';
export type { ReconstructedName } from './parseName';
export { score, scoreKeys, TIER_SCORES, MIDDLE_INITIAL_PENALTY } from './score';
export { resolve, resolveRaw, clearMatchMemo, matchMemoSize, MAX_REPORTED_CANDIDATES } from './resolve';
export { damerauLevenshtein } from './damerau';
export { nicknameGroup, areNicknames, NICKNAMES, NICKNAME_GROUP_COUNT } from './nicknames';
export {
  toReportEntry,
  buildMatchReport,
  sortReportEntries,
  MATCH_METHODS,
  LINKING_METHODS,
} from './report';
export type { BuildMatchReportInput } from './report';
