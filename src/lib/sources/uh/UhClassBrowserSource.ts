// ScheduleSource for the UH Class Browser JSON API (MULTI_SCHOOL_DESIGN §4.2 row `uh`). Per subject:
// 1 GET /api/terms (cached once per run) + ⌈sections / perPage⌉ POST /api/courses pages. Polite: a delay
// between request starts, 15 s timeout, 3 retries on 5xx / timeouts, the ProfPeek User-Agent, and a raw
// JSON disk cache under data/raw/uh/classbrowser/{term}/{SUBJECT}.json (gitignored).
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { RawSection, ScheduleSource, SourceInfo } from '@/lib/sources/types';
import { USER_AGENT } from './bundle';
import { parseClassRecord, parseCoursesPage, parseTermsJson, termCodeFor, type ClassBrowserTerm } from './parseClassBrowser';

export const UH_CLASS_BROWSER_SOURCE_INFO: SourceInfo = {
  id: 'uh-classbrowser',
  label: 'UH Class Browser',
  url: 'https://classbrowser.uh.edu',
  license: null, // public API, no licence declared — attribution only
};

export const DEFAULT_CLASS_BROWSER_BASE = 'https://classbrowser.uh.edu/api';
export const DEFAULT_CLASS_BROWSER_CACHE_DIR = path.join('data', 'raw', 'uh', 'classbrowser');
export const DEFAULT_RETRY_BACKOFF_MS: readonly number[] = [500, 1500, 4500];
/** Hard stop for the page loop (306 sections was the largest subject seen; per_page 500 → 1 page). */
export const MAX_PAGES = 50;

export interface ClassBrowserLogger { info: (msg: string) => void; warn: (msg: string) => void }

export interface UhClassBrowserSourceOptions {
  baseUrl?: string;
  perPage?: number;                 // default 500
  delayMs?: number;                 // env SCHEDULE_FETCH_DELAY_MS (default 100)
  timeoutMs?: number;               // default 15000
  retryBackoffMs?: readonly number[];
  cacheDir?: string;                // default data/raw/uh/classbrowser
  /** Bypass the disk cache (--refresh). Fresh responses are still written to it. */
  refresh?: boolean;
  /** Set false to disable the disk cache entirely (tests). */
  useCache?: boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: ClassBrowserLogger;
}

export class ClassBrowserHttpError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`Class Browser ${status} for ${url}`);
    this.name = 'ClassBrowserHttpError';
  }
}

/** What the per-subject cache file holds. */
export interface CachedSubject { term: TermCode; code: string; subject: string; fetchedAt: string; total: number; records: unknown[] }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class UhClassBrowserSource implements ScheduleSource {
  readonly info = UH_CLASS_BROWSER_SOURCE_INFO;
  private readonly baseUrl: string;
  private readonly perPage: number;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private readonly backoff: readonly number[];
  private readonly cacheDir: string;
  private readonly refresh: boolean;
  private readonly useCache: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly log: ClassBrowserLogger;
  private terms: Promise<ClassBrowserTerm[]> | null = null;
  private lastStart = 0;
  /** Counters for the script summary line. */
  readonly stats = { requests: 0, cacheHits: 0, retries: 0 };

  constructor(opts: UhClassBrowserSourceOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_CLASS_BROWSER_BASE).replace(/\/+$/, '');
    this.perPage = Math.max(1, opts.perPage ?? 500);
    this.delayMs = opts.delayMs ?? 100;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.backoff = opts.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    this.cacheDir = path.resolve(opts.cacheDir ?? DEFAULT_CLASS_BROWSER_CACHE_DIR);
    this.refresh = opts.refresh ?? false;
    this.useCache = opts.useCache ?? true;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  // ------------------------------------------------------------------------------------ public API

  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{ term: TermCode; fetchedAt: string; sections: RawSection[] }> {
    if (opts.schoolId !== 'uh') throw new Error(`UhClassBrowserSource only serves "uh" (got "${opts.schoolId}")`);
    const subject = opts.subject.trim().toUpperCase();
    const cached = await this.subjectRecords(opts.term, subject);
    const sections: RawSection[] = [];
    for (const record of cached.records) {
      const s = parseClassRecord(record, { subject });
      if (s) sections.push(s);
    }
    this.log.info(
      `[uh-classbrowser] ${subject} ${opts.term} (code ${cached.code}): ${cached.total} records → ${sections.length} sections ` +
        `(${this.stats.requests} requests, ${this.stats.cacheHits} cache hits, ${this.stats.retries} retries)`,
    );
    return { term: opts.term, fetchedAt: cached.fetchedAt, sections };
  }

  /** Published terms (one request per source instance, cached on disk as terms.json). */
  async publishedTerms(): Promise<ClassBrowserTerm[]> {
    if (!this.terms) this.terms = this.loadTerms();
    return this.terms;
  }

  /** PeopleSoft code for a TermCode; throws when the API does not list the term. */
  async resolveTermCode(term: TermCode): Promise<string> {
    const code = termCodeFor(await this.publishedTerms(), term);
    if (!code) throw new Error(`UH Class Browser does not list term ${term} (GET ${this.baseUrl}/terms)`);
    return code;
  }

  // -------------------------------------------------------------------------------------- internals

  cachePath(term: TermCode, subject: string): string {
    return path.join(this.cacheDir, term, `${subject}.json`);
  }

  private async loadTerms(): Promise<ClassBrowserTerm[]> {
    const file = path.join(this.cacheDir, 'terms.json');
    const cached = await this.readCache<unknown>(file);
    if (cached) return parseTermsJson(cached.value);
    const body = await this.request(`${this.baseUrl}/terms`, null);
    await this.writeCache(file, body);
    return parseTermsJson(body);
  }

  private async subjectRecords(term: TermCode, subject: string): Promise<CachedSubject> {
    const file = this.cachePath(term, subject);
    const cached = await this.readCache<CachedSubject>(file);
    if (cached && Array.isArray(cached.value.records)) return { ...cached.value, fetchedAt: cached.value.fetchedAt || cached.mtime };
    const code = await this.resolveTermCode(term);
    const records: unknown[] = [];
    let total = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = `${this.baseUrl}/courses${page > 1 ? `?page=${page}` : ''}`;
      const parsed = parseCoursesPage(await this.request(url, { term: code, subject, per_page: this.perPage }));
      records.push(...parsed.data);
      total = parsed.total;
      if (parsed.data.length === 0 || parsed.currentPage >= parsed.lastPage) break;
    }
    const value: CachedSubject = { term, code, subject, fetchedAt: this.now().toISOString(), total, records };
    await this.writeCache(file, value);
    return value;
  }

  private async readCache<T>(file: string): Promise<{ value: T; mtime: string } | null> {
    if (!this.useCache || this.refresh) return null;
    try {
      const [text, st] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
      this.stats.cacheHits += 1;
      return { value: JSON.parse(text) as T, mtime: st.mtime.toISOString() };
    } catch {
      return null;
    }
  }

  private async writeCache(file: string, value: unknown): Promise<void> {
    if (!this.useCache) return;
    try {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(value), 'utf8');
    } catch (err) {
      this.log.warn(`[uh-classbrowser] could not write cache ${file}: ${(err as Error).message}`);
    }
  }

  private async politeDelay(): Promise<void> {
    if (this.delayMs <= 0) return;
    const wait = this.lastStart + this.delayMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = Date.now();
  }

  /** GET (body null) or POST JSON; parsed JSON back. Retries on 5xx / timeout / network error. */
  private async request(url: string, body: Record<string, unknown> | null): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      this.stats.requests += 1;
      try {
        await this.politeDelay();
        const res = await this.fetchImpl(url, {
          method: body ? 'POST' : 'GET',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new ClassBrowserHttpError(url, res.status);
        return await res.json();
      } catch (err) {
        if (!isRetryable(err) || attempt >= this.backoff.length) throw err;
        this.stats.retries += 1;
        const delay = this.backoff[attempt];
        this.log.warn(`[uh-classbrowser] ${describe(err)} — retry ${attempt + 1}/${this.backoff.length} in ${delay} ms: ${url}`);
        await this.sleep(delay);
      }
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof ClassBrowserHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof Error) return err.name === 'TimeoutError' || err.name === 'AbortError' || err.name === 'TypeError';
  return false;
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
