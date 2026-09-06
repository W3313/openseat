// Optimal string alignment distance (restricted Damerau–Levenshtein): insertions, deletions,
// substitutions cost 1 and an adjacent transposition also costs 1 (SPEC 7.3 T6: "stienberg" ↔ "steinberg" = 1).

/** Optimal string alignment distance (adjacent transposition counts as 1). */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  // Three rolling rows: two back, one back, current.
  let prev2: number[] = new Array<number>(m + 1).fill(0);
  let prev1: number[] = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev1[j] = j;

  for (let i = 1; i <= n; i++) {
    const cur: number[] = new Array<number>(m + 1);
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let best = Math.min(
        prev1[j] + 1,        // deletion
        cur[j - 1] + 1,      // insertion
        prev1[j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        best = Math.min(best, prev2[j - 2] + 1); // transposition
      }
      cur[j] = best;
    }
    prev2 = prev1;
    prev1 = cur;
  }
  return prev1[m];
}
