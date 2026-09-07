// ScheduleSource for the UCSB Curriculums API v3 (MULTI_SCHOOL_DESIGN §4.2 "ucsb").
//   GET https://api.ucsb.edu/academics/curriculums/v3/classes/search?quarter=20264&subjectCode=CMPSC&pageNumber=1&pageSize=500
//   header  ucsb-api-key: <free developer key — https://developer.ucsb.edu, "Get an API key" (any UCSB
//   NetID or a registered developer account); the Curriculums product needs no approval>.
// Without a key (env UCSB_API_KEY unset) the adapter is a documented no-op: it returns no sections with
// fetchedAt '' so ingest treats UCSB as grades-only (§5) — nothing is requested from the network.
// Polite by construction (same shape as CourseExplorerSource): semaphore, delay between request starts,
// 10 s timeout, retries on 5xx/timeouts, and a raw JSON cache under data/raw/ucsb/<term>/<SUBJECT>.json.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { RawSection, ScheduleSource, SourceInfo } from '@/lib/sources/types';
import { subjectSpelling } from './courseId';
import { type CurriculumsClass, type CurriculumsPage, parseCurriculumsClasses } from './parseCurriculums';
import { termToQuarterCode } from './quarter';

export const UCSB_CURRICULUMS_SOURCE_INFO: SourceInfo = {
  id: 'ucsb-curriculums',
  label: 'UCSB Curriculums API (api.ucsb.edu)',
  url: 'https://developer.ucsb.edu/apis/academics/curriculums',
  license: null, // developer terms of use; attribution only
};

export const DEFAULT_UCSB_CURRICULUMS_BASE = 'https://api.ucsb.edu/academics/curriculums/v3';
export const DEFAULT_UCSB_RAW_CACHE_DIR = path.join('data', 'raw', 'ucsb');
export const UCSB_API_KEY_HEADER = 'ucsb-api-key';
export const UCSB_MAX_PAGE_SIZE = 500;
export const UCSB_USER_AGENT = 'ProfPeek/1.0 (+https://github.com/W3313/profpeek)';
const RETRY_BACKOFF_MS: readonly number[] = [500, 1500, 4500];

export interface UcsbLogger { info: (msg: string) => void; warn: (msg: string) => void }

export interface UcsbCurriculumsSourceOptions {
  /** env UCSB_API_KEY; undefined → no-op adapter. */
  apiKey?: string;
  baseUrl?: string;
  /** Emit open/closed + seatsKnown from enrolledTotal/maxEnroll (unverified without a key; default false). */
  seats?: boolean;
  concurrency?: number;
  delayMs?: number;
  timeoutMs?: number;
  pageSize?: number;
  cacheDir?: string;
  refresh?: boolean;
  useCache?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: UcsbLogger;
}

export class UcsbCurriculumsHttpError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`UCSB Curriculums API ${status} for ${url.replace(/pageNumber=\d+/, 'pageNumber=…')}`);
    this.name = 'UcsbCurriculumsHttpError';
  }
}

interface Cached { classes: CurriculumsClass[]; fetchedAt: string }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class UcsbCurriculumsSource implements ScheduleSource {
  readonly info = UCSB_CURRICULUMS_SOURCE_INFO;
  readonly stats = { requests: 0, cacheHits: 0, retries: 0 };
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly seats: boolean;
  private readonly limit: number;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly cacheDir: string;
  private readonly refresh: boolean;
  private readonly useCache: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly log: UcsbLogger;
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private lastStart = 0;
  private warnedNoKey = false;

  constructor(opts: UcsbCurriculumsSourceOptions = {}) {
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_UCSB_CURRICULUMS_BASE).replace(/\/+$/, '');
    this.seats = opts.seats ?? false;
    this.limit = Math.max(1, opts.concurrency ?? 2);
    this.delayMs = opts.delayMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.pageSize = Math.min(UCSB_MAX_PAGE_SIZE, Math.max(1, opts.pageSize ?? UCSB_MAX_PAGE_SIZE));
    this.cacheDir = path.resolve(opts.cacheDir ?? DEFAULT_UCSB_RAW_CACHE_DIR);
    this.refresh = opts.refresh ?? false;
    this.useCache = opts.useCache ?? true;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  /** True when a key is configured (otherwise fetchSections is a no-op). */
  get enabled(): boolean {
    return this.apiKey !== undefined;
  }

  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{ term: TermCode; fetchedAt: string; sections: RawSection[] }> {
    if (opts.schoolId !== 'ucsb') throw new Error(`UcsbCurriculumsSource only serves "ucsb" (got "${opts.schoolId}")`);
    const subject = opts.subject.trim().toUpperCase();
    if (!this.enabled) {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true;
        this.log.warn('[ucsb-curriculums] UCSB_API_KEY is not set — schedule skipped (grades-only). Get a free key at https://developer.ucsb.edu');
      }
      return { term: opts.term, fetchedAt: '', sections: [] };
    }
    const cached = await this.load(opts.term, subject);
    const courses = parseCurriculumsClasses(cached.classes, { subject, seats: this.seats });
    const sections = courses.flatMap((c) => c.sections);
    this.log.info(
      `[ucsb-curriculums] ${subject} ${opts.term}: ${courses.length} courses → ${sections.length} sections ` +
        `(${this.stats.requests} requests, ${this.stats.cacheHits} cache hits, ${this.stats.retries} retries)`,
    );
    return { term: opts.term, fetchedAt: cached.fetchedAt, sections };
  }

  cachePath(term: TermCode, subject: string): string {
    return path.join(this.cacheDir, term, `${subject}.json`);
  }

  /** All classes of a (term, subject) via cache → paginated network. */
  private async load(term: TermCode, subject: string): Promise<Cached> {
    const file = this.cachePath(term, subject);
    if (this.useCache && !this.refresh) {
      try {
        const [text, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
        this.stats.cacheHits += 1;
        return { classes: JSON.parse(text) as CurriculumsClass[], fetchedAt: st.mtime.toISOString() };
      } catch {
        /* miss */
      }
    }
    const classes: CurriculumsClass[] = [];
    const quarter = termToQuarterCode(term);
    const subjectCode = subjectSpelling(subject);
    for (let page = 1; ; page += 1) {
      const url = `${this.baseUrl}/classes/search?quarter=${quarter}&subjectCode=${encodeURIComponent(subjectCode)}&pageNumber=${page}&pageSize=${this.pageSize}`;
      const body = await this.getJson(url);
      const got = body?.classes ?? [];
      classes.push(...got);
      const total = typeof body?.total === 'number' ? body.total : null;
      if (got.length < this.pageSize || (total !== null && classes.length >= total) || page > 50) break;
    }
    const fetchedAt = this.now().toISOString();
    if (this.useCache) {
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(classes), 'utf8');
      } catch (err) {
        this.log.warn(`[ucsb-curriculums] could not write cache ${file}: ${(err as Error).message}`);
      }
    }
    return { classes, fetchedAt };
  }

  private async acquire(): Promise<() => void> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }

  private async politeDelay(): Promise<void> {
    if (this.delayMs <= 0) return;
    const wait = this.lastStart + this.delayMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = Date.now();
  }

  /** GET JSON with timeout; retries on 5xx / timeout / network error; 401/403 fail fast with a key hint. */
  private async getJson(url: string): Promise<CurriculumsPage | null> {
    const release = await this.acquire();
    try {
      for (let attempt = 0; ; attempt += 1) {
        await this.politeDelay();
        this.stats.requests += 1;
        try {
          const res = await this.fetchImpl(url, {
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: { accept: 'application/json', [UCSB_API_KEY_HEADER]: this.apiKey ?? '', 'user-agent': UCSB_USER_AGENT },
          });
          if (res.status === 401 || res.status === 403) {
            throw new Error(`UCSB Curriculums API rejected the key (HTTP ${res.status}) — check UCSB_API_KEY (https://developer.ucsb.edu)`);
          }
          if (res.status === 404) return null;
          if (!res.ok) throw new UcsbCurriculumsHttpError(url, res.status);
          return (await res.json()) as CurriculumsPage;
        } catch (err) {
          if (!isRetryable(err) || attempt >= RETRY_BACKOFF_MS.length) throw err;
          this.stats.retries += 1;
          const delay = RETRY_BACKOFF_MS[attempt];
          this.log.warn(`[ucsb-curriculums] ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)} — retry ${attempt + 1}/${RETRY_BACKOFF_MS.length} in ${delay} ms`);
          await this.sleep(delay);
        }
      }
    } finally {
      release();
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof UcsbCurriculumsHttpError) return err.status >= 500;
  if (err instanceof Error) return err.name === 'TimeoutError' || err.name === 'AbortError' || err.name === 'TypeError';
  return false;
}
