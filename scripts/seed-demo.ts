// `npm run data:seed` → tsx scripts/seed-demo.ts [--seed 20260903] [--term 2026-fa] [--subjects CS,ECE,...] [--out data/raw/demo/uiuc]
// Writes the deterministic fictional raw dataset (SPEC 6.5): gpa.csv, sections.json, professors.json,
// reviews.json, meta.json and seed-hash.txt. Re-running with the same inputs produces identical bytes.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/config/env';
import { assertTermCode } from '@/lib/utils/term';
import { buildDemoSeed, SEED_FILE_ORDER, SEED_HASH_FILE } from '@/lib/sources/demo/generator';
import { fail, log } from './lib/log';
import { flagList, flagString, readArgs } from './lib/args';

export const DEFAULT_OUT_DIR = path.join('data', 'raw', 'demo', 'uiuc');

async function main(): Promise<void> {
  const args = readArgs();
  const seed = Number(flagString(args, 'seed', String(env.DEMO_SEED)));
  if (!Number.isInteger(seed)) fail(`--seed must be an integer, got ${flagString(args, 'seed')}`);
  const currentTerm = assertTermCode(flagString(args, 'term', env.CURRENT_TERM) ?? env.CURRENT_TERM, '--term');
  const subjects = flagList(args, 'subjects', env.SUBJECTS).map((s) => s.toUpperCase()).sort();
  const outDir = path.resolve(flagString(args, 'out', DEFAULT_OUT_DIR) ?? DEFAULT_OUT_DIR);

  log.info(`seeding fictional dataset · seed ${seed} · term ${currentTerm} · subjects ${subjects.join(',')}`);
  const built = await buildDemoSeed({ seed, currentTerm, subjects });

  await mkdir(outDir, { recursive: true });
  let changed = 0;
  for (const name of SEED_FILE_ORDER) {
    const target = path.join(outDir, name);
    const previous = await readFile(target, 'utf8').catch(() => null);
    if (previous !== built.files[name]) changed++;
    await writeFile(target, built.files[name], 'utf8');
  }
  await writeFile(path.join(outDir, SEED_HASH_FILE), `${built.hash}\n`, 'utf8');

  const m = built.result.meta;
  const bytes = SEED_FILE_ORDER.reduce((n, name) => n + Buffer.byteLength(built.files[name]), 0);
  log.summary(
    `seeded ${m.gradeRowCount.toLocaleString()} grade rows · ${m.professorCount} professors (${m.reviewedProfessorCount} reviewed, ${m.gradesOnlyCount} grades-only) · ` +
      `${m.reviewCount.toLocaleString()} reviews · ${m.sectionCount} sections (${m.openSectionCount} open) · ${m.edgeCases.length}/12 edge cases · ` +
      `${(bytes / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), outDir)} · hash ${built.hash.slice(0, 12)} · ${changed === 0 ? 'unchanged' : `${changed} file(s) changed`}`,
  );
}

main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
