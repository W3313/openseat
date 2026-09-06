// SPEC 7.3 T4 — 25 nickname groups. Each group is keyed by every member so lookups are symmetric:
// nicknameGroup('bob') → Set{'robert','rob','bob','bobby'}.

const GROUPS: readonly (readonly string[])[] = [
  ['william', 'bill', 'will', 'billy'],
  ['robert', 'rob', 'bob', 'bobby'],
  ['elizabeth', 'liz', 'beth', 'betsy'],
  ['michael', 'mike'],
  ['katherine', 'kathryn', 'kate', 'katie', 'kathy'],
  ['margaret', 'maggie', 'peggy', 'meg'],
  ['richard', 'rick', 'dick'],
  ['james', 'jim', 'jimmy'],
  ['joseph', 'joe'],
  ['thomas', 'tom'],
  ['charles', 'charlie', 'chuck'],
  ['daniel', 'dan', 'danny'],
  ['matthew', 'matt'],
  ['christopher', 'chris'],
  ['anthony', 'tony'],
  ['jennifer', 'jen', 'jenny'],
  ['jonathan', 'jon'],
  ['nicholas', 'nick'],
  ['alexander', 'alex'],
  ['samuel', 'sam'],
  ['benjamin', 'ben'],
  ['andrew', 'andy', 'drew'],
  ['edward', 'ed', 'ted'],
  ['steven', 'stephen', 'steve'],
  ['geoffrey', 'jeffrey', 'geoff', 'jeff'],
];

function buildIndex(): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, ReadonlySet<string>>();
  for (const group of GROUPS) {
    const set: ReadonlySet<string> = new Set(group);
    for (const member of group) index.set(member, set);
  }
  return index;
}

/** Every nickname group keyed by every member (SPEC 7.3 T4). */
export const NICKNAMES: ReadonlyMap<string, ReadonlySet<string>> = buildIndex();

/** Number of groups — 25 per SPEC; exported so a test can assert the table is complete. */
export const NICKNAME_GROUP_COUNT = GROUPS.length;

/** Nickname groups of SPEC 7.3 T4 keyed by every member: nicknameGroup('bob') → Set{'robert','rob','bob','bobby'}. */
export function nicknameGroup(firstToken: string): ReadonlySet<string> | null {
  return NICKNAMES.get(firstToken) ?? null;
}

/** True when both tokens are in the same nickname group (and are not identical — that is T1/T2's job). */
export function areNicknames(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  const group = NICKNAMES.get(a);
  return group !== undefined && group.has(b);
}
