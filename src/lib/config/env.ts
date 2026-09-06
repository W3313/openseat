// Single import point for process.env (SPEC section 11). Parsed once with zod; every default from the
// spec table lives here. Server/scripts import `env`; client components never read process.env except
// NEXT_PUBLIC_* (and even those are passed down as props where possible).
import { z } from 'zod';
import { existsSync } from 'node:fs';
import nodePath from 'node:path';
import type { TermCode } from '@/lib/domain/types';
import { assertServerOnly } from './serverOnly';

assertServerOnly('src/lib/config/env.ts');

const TERM_CODE_RE = /^\d{4}-(fa|sp|su|wi)$/;

const TermCodeSchema = z
  .string()
  .regex(TERM_CODE_RE, 'expected a TermCode like 2026-fa')
  .transform((v) => v as TermCode);

/** "0"/"1"/"true"/"false" → boolean, with a default. */
const flag = (def: '0' | '1') =>
  z
    .enum(['0', '1', 'true', 'false'])
    .default(def)
    .transform((v) => v === '1' || v === 'true');

const SubjectsSchema = z
  .string()
  .default('CS,ECE,MATH,PHYS,STAT,CHEM')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );

export const EnvSchema = z.object({
  DATA_MODE: z.enum(['demo', 'live']).default('demo'),
  CURRENT_TERM: TermCodeSchema.default('2026-fa'),
  SUBJECTS: SubjectsSchema,
  GRADE_YEARS_BACK: z.coerce.number().int().min(1).max(30).default(6),
  DEMO_SEED: z.coerce.number().int().default(20260903),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5'),
  SUMMARY_SERVER_FALLBACKS: flag('0'),
  MAX_SUMMARIES: z.coerce.number().int().min(0).default(500),
  /** auto = Claude if ANTHROPIC_API_KEY, else the OpenAI-compatible provider if GROQ_API_KEY, else extractive. */
  SUMMARY_PROVIDER: z.enum(['auto', 'claude', 'openai-compatible', 'extractive']).default('auto'),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-20b'),
  GROQ_PROVIDER_NAME: z.string().min(1).default('Groq'),
  /** 1 = the summary API route may call the configured model when nothing valid is cached (never persisted). */
  SUMMARY_ON_DEMAND: flag('0'),
  REVIEW_SOURCE: z.enum(['demo', 'rmp', 'none']).default('demo'),
  RMP_ENABLED: flag('0'),
  RMP_SCHOOL_ID: z.string().min(1).optional(),
  RMP_AUTH_HEADER: z.string().min(1).default('Basic dGVzdDp0ZXN0'),
  UIUC_GPA_CSV_URL: z
    .url()
    .default('https://raw.githubusercontent.com/wadefagen/datasets/main/gpa/uiuc-gpa-dataset.csv'),
  UIUC_COURSE_EXPLORER_BASE: z.url().default('https://courses.illinois.edu/cisapp/explorer/schedule'),
  SCHEDULE_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  SCHEDULE_FETCH_DELAY_MS: z.coerce.number().int().min(0).default(100),
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  NEXT_PUBLIC_REPO_URL: z.string().default('https://github.com/W3313/profpeek'),
  SMOKE_BASE_URL: z.url().optional(),
});

/** Parsed, defaulted environment. `SUBJECTS` is already split into an upper-cased array. */
export type Env = z.infer<typeof EnvSchema>;

/** Names of every variable the app reads — used by .env.example and the /about page. */
export const ENV_KEYS = Object.keys(EnvSchema.shape) as (keyof Env)[];

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n  ${issues.join('\n  ')}`);
    this.name = 'EnvError';
  }
}

/**
 * Parse an environment map (defaults to `process.env`). Empty strings count as "unset" so a blank line
 * in `.env` never overrides a default. Throws `EnvError` listing every offending variable.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const input: Record<string, string> = {};
  for (const key of ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') input[key] = value.trim();
  }
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return parsed.data;
}

/** The process-wide environment, parsed once at first import. */
/**
 * Scripts run with `tsx` do not get Next's dotenv handling, so load `.env.local` then `.env` (existing
 * variables win) before parsing. Next itself has already populated process.env, so this is a no-op there.
 */
function loadDotEnvFiles(): void {
  const loader = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof loader !== 'function' || process.env.NEXT_RUNTIME) return;
  for (const file of ['.env.local', '.env']) {
    try {
      const path = nodePath.join(process.cwd(), file);
      if (existsSync(path)) loader.call(process, path);
    } catch {
      // unreadable or malformed env file: fall through to whatever process.env already holds
    }
  }
}

loadDotEnvFiles();

export const env: Env = loadEnv();

/** True when the fictional committed dataset is in use. */
export function isDemoMode(e: Env = env): boolean {
  return e.DATA_MODE === 'demo';
}

/** Absolute site origin with no trailing slash — the one place pages build canonical/share URLs from. */
export const siteUrl: string = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
