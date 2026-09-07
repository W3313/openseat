// Build clock for the data scripts: the wall clock unless a caller (tests) injects `now`. Real datasets carry
// wall-clock stamps, so they are refreshed deliberately and committed rather than regenerated in CI.

/** ISO UTC instant to stamp on generated files. `now` (tests) wins over the wall clock. */
export function buildClock(now?: () => Date): string {
  return (now ? now() : new Date()).toISOString();
}
