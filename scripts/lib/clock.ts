// Build clock for the data scripts. In demo mode every timestamp the pipeline stamps (meta.builtAt,
// match-report.generatedAt, rankings generatedAt, extractive summary generatedAt) is the seed's fixed
// snapshot instant, so `npm run data:all` is byte-reproducible and CI's `git diff --exit-code -- data`
// passes (SPEC 6.5 determinism, 12.5). Live mode uses the wall clock.
import type { Env } from '@/lib/config/env';
import { DEMO_FETCHED_AT } from '@/lib/sources/demo/DemoScheduleSource';

/** ISO UTC instant to stamp on generated files. `now` (tests) wins over both defaults. */
export function buildClock(env: Pick<Env, 'DATA_MODE'>, now?: () => Date): string {
  if (now) return now().toISOString();
  return env.DATA_MODE === 'demo' ? DEMO_FETCHED_AT : new Date().toISOString();
}
