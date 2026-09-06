// `npm run data:schedule` — live only. Warms the raw Course Explorer XML cache under
// data/raw/uiuc/{term}/{SUBJECT}/*.xml (gitignored) so `data:ingest` can run offline afterwards.
//
//   tsx scripts/fetch-uiuc-schedule.ts [--term 2026-fa] [--subjects CS,ECE] [--refresh]
//                                      [--concurrency 4] [--delay 100]
import { pathToFileURL } from 'node:url';
import { env } from '@/lib/config/env';
import type { TermCode } from '@/lib/domain/types';
import { CourseExplorerSource } from '@/lib/sources/uiuc/CourseExplorerSource';
import { isTermCode } from '@/lib/utils/term';
import { flagBool, flagList, flagString, readArgs } from './lib/args';
import { fail, log } from './lib/log';

/**
 * Node's parseArgs (strict: false) reads an undeclared `--name value` as `name: true` plus a positional.
 * Rewrite to `--name=value` so `--subjects CS,ECE` and `--subjects=CS,ECE` both work.
 */
function normalizeArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (/^--[a-zA-Z][\w-]*$/.test(a) && next !== undefined && !next.startsWith('-')) {
      out.push(`${a}=${next}`);
      i += 1;
    } else out.push(a);
  }
  return out;
}

async function main(): Promise<void> {
  const args = readArgs(normalizeArgv(process.argv.slice(2)));
  const termArg = flagString(args, 'term', env.CURRENT_TERM)!;
  if (!isTermCode(termArg)) fail(`--term must look like 2026-fa (got "${termArg}")`);
  const term: TermCode = termArg;
  const subjects = flagList(args, 'subjects', env.SUBJECTS).map((s) => s.toUpperCase());
  if (subjects.length === 0) fail('no subjects given (--subjects CS,ECE or env SUBJECTS)');
  const concurrency = Number(flagString(args, 'concurrency', String(env.SCHEDULE_FETCH_CONCURRENCY)));
  const delayMs = Number(flagString(args, 'delay', String(env.SCHEDULE_FETCH_DELAY_MS)));
  if (!Number.isInteger(concurrency) || concurrency < 1) fail('--concurrency must be a positive integer');
  if (!Number.isInteger(delayMs) || delayMs < 0) fail('--delay must be a non-negative integer (ms)');

  const source = new CourseExplorerSource({
    baseUrl: env.UIUC_COURSE_EXPLORER_BASE,
    concurrency,
    delayMs,
    refresh: flagBool(args, 'refresh'),
    log,
  });

  let usedTerm: TermCode | null = null;
  let totalSections = 0;
  let offered = 0;
  const perSubject: string[] = [];
  for (const subject of subjects) {
    const result = await source.fetchSections({ schoolId: 'uiuc', term, subject });
    if (usedTerm && usedTerm !== result.term) fail(`term mismatch: ${usedTerm} vs ${result.term} for ${subject}`);
    usedTerm = result.term;
    totalSections += result.sections.length;
    offered += result.sections.filter((s) => s.statusCode.toUpperCase() === 'A').length;
    perSubject.push(`${subject} ${result.sections.length}`);
  }

  const fallback = usedTerm && usedTerm !== term ? ` (fallback from ${term}: not yet published)` : '';
  log.summary(
    `cached ${subjects.length} subjects for ${usedTerm ?? term}${fallback} · ${totalSections.toLocaleString('en-US')} sections ` +
      `(${offered.toLocaleString('en-US')} offered) · ${perSubject.join(', ')} · ` +
      `${source.stats.requests} requests, ${source.stats.cacheHits} cache hits, ${source.stats.notFound} 404s, ${source.stats.retries} retries`,
  );
}

/** Run only when executed directly (`tsx scripts/...`), never when imported by tests or probes. */
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
