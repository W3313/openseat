// ScheduleSource for the UIUC Course Explorer XML API (SPEC 6.2, SOURCE_FACTS 2). Request topology per
// subject: 1 (year → terms) + 1 (subject → courses) + N (course?mode=cascade). Polite by construction:
// inline semaphore, delay between request starts, 8 s timeout, 3 retries on 5xx/timeouts, and a raw XML
// disk cache under data/raw/uiuc/{term}/{SUBJECT}/{number}.xml (gitignored).
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { RawSection, ScheduleSource, SourceInfo } from '@/lib/sources/types';
import { termToExplorerPath, termYear } from '@/lib/utils/term';
import {
  parseCourseExplorerXml,
  parseCourseListXml,
  parseTermsXml,
  resolveScheduleTerm,
} from './parseCourseExplorerXml';

export const COURSE_EXPLORER_SOURCE_INFO: SourceInfo = {
  id: 'uiuc-course-explorer',
  label: 'UIUC Course Explorer',
  url: 'https://courses.illinois.edu/cisapp/explorer/schedule',
  license: null, // public API, attribution only
};

export const DEFAULT_COURSE_EXPLORER_BASE = 'https://courses.illinois.edu/cisapp/explorer/schedule';
export const DEFAULT_RAW_CACHE_DIR = path.join('data', 'raw', 'uiuc');
export const DEFAULT_RETRY_BACKOFF_MS: readonly number[] = [500, 1500, 4500];

export interface ExplorerLogger { info: (msg: string) => void; warn: (msg: string) => void }

export interface CourseExplorerSourceOptions {
  baseUrl?: string;                 // env UIUC_COURSE_EXPLORER_BASE
  concurrency?: number;             // env SCHEDULE_FETCH_CONCURRENCY (default 4)
  delayMs?: number;                 // env SCHEDULE_FETCH_DELAY_MS (default 100)
  timeoutMs?: number;               // default 8000
  retryBackoffMs?: readonly number[];
  cacheDir?: string;                // default data/raw/uiuc
  /** Bypass the disk cache (--refresh). Fresh responses are still written to it. */
  refresh?: boolean;
  /** Set false to disable the disk cache entirely (tests). */
  useCache?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: ExplorerLogger;
}

export class CourseExplorerHttpError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`Course Explorer ${status} for ${url}`);
    this.name = 'CourseExplorerHttpError';
  }
}

/** Tiny counting semaphore (SPEC forbids a p-limit dependency). */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.queue.shift()?.();
    };
  }
}

interface FetchedText { text: string; fetchedAt: string; fromCache: boolean }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CourseExplorerSource implements ScheduleSource {
  readonly info = COURSE_EXPLORER_SOURCE_INFO;
  private readonly baseUrl: string;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private readonly backoff: readonly number[];
  private readonly cacheDir: string;
  private readonly refresh: boolean;
  private readonly useCache: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly log: ExplorerLogger;
  private readonly semaphore: Semaphore;
  private lastStart = 0;
  /** Counters for the script summary line. */
  readonly stats = { requests: 0, cacheHits: 0, notFound: 0, retries: 0 };

  constructor(opts: CourseExplorerSourceOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_COURSE_EXPLORER_BASE).replace(/\/+$/, '');
    this.delayMs = opts.delayMs ?? 100;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.backoff = opts.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    this.cacheDir = path.resolve(opts.cacheDir ?? DEFAULT_RAW_CACHE_DIR);
    this.refresh = opts.refresh ?? false;
    this.useCache = opts.useCache ?? true;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
    this.semaphore = new Semaphore(Math.max(1, opts.concurrency ?? 4));
  }

  // ------------------------------------------------------------------------------------ public API

  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{
    term: TermCode; fetchedAt: string; sections: RawSection[];
  }> {
    if (opts.schoolId !== 'uiuc') throw new Error(`CourseExplorerSource only serves "uiuc" (got "${opts.schoolId}")`);
    const subject = opts.subject.toUpperCase();
    const term = await this.resolveTerm(opts.term);
    if (term !== opts.term) this.log.warn(`[course-explorer] ${opts.term} not published; falling back to ${term}`);

    const listUrl = `${this.baseUrl}/${termToExplorerPath(term)}/${subject}.xml`;
    const list = await this.getText(listUrl, this.cachePath(term, subject, '_courses'));
    if (!list) {
      this.log.warn(`[course-explorer] subject ${subject} not offered in ${term}`);
      return { term, fetchedAt: this.now().toISOString(), sections: [] };
    }
    const courses = parseCourseListXml(list.text);
    const stamps: string[] = [list.fetchedAt];
    const results = await Promise.all(
      courses.map(async (course) => {
        const url = `${this.baseUrl}/${termToExplorerPath(term)}/${subject}/${course.number}.xml?mode=cascade`;
        const got = await this.getText(url, this.cachePath(term, subject, course.number));
        if (!got) return [];                                            // 404 → not offered → skip silently
        stamps.push(got.fetchedAt);
        return parseCourseExplorerXml(got.text, { subject, number: course.number }).sections;
      }),
    );
    const sections = results.flat();
    const fetchedAt = stamps.reduce((a, b) => (a > b ? a : b));
    this.log.info(
      `[course-explorer] ${subject} ${term}: ${courses.length} courses → ${sections.length} sections ` +
        `(${this.stats.requests} requests, ${this.stats.cacheHits} cache hits, ${this.stats.notFound} 404s, ${this.stats.retries} retries)`,
    );
    return { term, fetchedAt, sections };
  }

  /** Published terms for a calendar year (never cached; one request). Empty when the year is unknown. */
  async publishedTerms(year: number): Promise<TermCode[]> {
    const got = await this.getText(`${this.baseUrl}/${year}.xml`, null);
    return got ? parseTermsXml(got.text).map((t) => t.term) : [];
  }

  /** Requested term if published, else the latest published term ≤ requested (looking back one year). */
  async resolveTerm(requested: TermCode): Promise<TermCode> {
    const year = termYear(requested);
    for (const y of [year, year - 1]) {
      const published = await this.publishedTerms(y);
      const pick = resolveScheduleTerm(requested, published);
      if (pick) return pick;
    }
    throw new Error(`Course Explorer has no published term ≤ ${requested} (checked ${year} and ${year - 1})`);
  }

  // -------------------------------------------------------------------------------------- internals

  cachePath(term: TermCode, subject: string, name: string): string {
    return path.join(this.cacheDir, term, subject, `${name}.xml`);
  }

  /** Text of a URL via cache → network; null on 404. */
  private async getText(url: string, cacheFile: string | null): Promise<FetchedText | null> {
    if (cacheFile && this.useCache && !this.refresh) {
      try {
        const [text, st] = await Promise.all([readFile(cacheFile, 'utf8'), stat(cacheFile)]);
        this.stats.cacheHits += 1;
        return { text, fetchedAt: st.mtime.toISOString(), fromCache: true };
      } catch {
        /* miss */
      }
    }
    const release = await this.semaphore.acquire();
    try {
      await this.politeDelay();
      const text = await this.fetchWithRetry(url);
      const fetchedAt = this.now().toISOString();
      if (text === null) return null;
      if (cacheFile && this.useCache) {
        try {
          await mkdir(path.dirname(cacheFile), { recursive: true });
          await writeFile(cacheFile, text, 'utf8');
        } catch (err) {
          this.log.warn(`[course-explorer] could not write cache ${cacheFile}: ${(err as Error).message}`);
        }
      }
      return { text, fetchedAt, fromCache: false };
    } finally {
      release();
    }
  }

  private async politeDelay(): Promise<void> {
    if (this.delayMs <= 0) return;
    const wait = this.lastStart + this.delayMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = Date.now();
  }

  /** GET with timeout; retries on 5xx / timeout / network error; null on 404; throws on other 4xx. */
  private async fetchWithRetry(url: string): Promise<string | null> {
    for (let attempt = 0; ; attempt += 1) {
      this.stats.requests += 1;
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: 'application/xml, text/xml' },
        });
        if (res.status === 404) {
          this.stats.notFound += 1;
          return null;
        }
        if (res.status >= 500) throw new CourseExplorerHttpError(url, res.status);
        if (!res.ok) throw new CourseExplorerHttpError(url, res.status);
        return await res.text();
      } catch (err) {
        const retryable = isRetryable(err);
        if (!retryable || attempt >= this.backoff.length) throw err;
        this.stats.retries += 1;
        const delay = this.backoff[attempt];
        this.log.warn(`[course-explorer] ${describe(err)} — retry ${attempt + 1}/${this.backoff.length} in ${delay} ms: ${url}`);
        await this.sleep(delay);
      }
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof CourseExplorerHttpError) return err.status >= 500;
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
    // undici network failures surface as TypeError("fetch failed")
    if (err.name === 'TypeError') return true;
  }
  return false;
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
