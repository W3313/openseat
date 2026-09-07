// ScheduleSource for purdue.io (MULTI_SCHOOL_DESIGN §4.2). One request per subject per term (the server
// rejects $top, so there is no paging) plus one Terms request per run to map our TermCode to the Banner
// code purdue.io filters on. Polite: 15 s timeout, 3 retries on 5xx/timeouts, delay between requests,
// and a raw JSON cache under data/raw/purdue/schedule/{term}/{SUBJECT}.json (gitignored).
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { RawSection, ScheduleSource, SourceInfo } from '@/lib/sources/types';
import { parseSectionsJson, parseTerms, resolvePurdueTerm, type PurdueIoTerm } from './parsePurdueIo';

export const PURDUE_IO_SOURCE_INFO: SourceInfo = {
  id: 'purdue-io',
  label: 'purdue.io course catalog API',
  url: 'https://api.purdue.io/odata',
  license: null, // public API, no licence declared; no seat counts
};

export const DEFAULT_PURDUE_IO_BASE = 'https://api.purdue.io/odata';
export const DEFAULT_PURDUE_SCHEDULE_CACHE_DIR = path.join('data', 'raw', 'purdue', 'schedule');
export const PURDUE_USER_AGENT = 'ProfPeek/1.0 (+https://github.com/W3313/profpeek)';
const RETRY_BACKOFF_MS: readonly number[] = [500, 1500, 4500];
const SECTIONS_EXPAND = 'Class($expand=Course($expand=Subject)),Meetings($expand=Instructors,Room($expand=Building))';

export interface PurdueIoLogger { info: (msg: string) => void; warn: (msg: string) => void }

export interface PurdueIoSourceOptions {
  baseUrl?: string;
  delayMs?: number;          // between request starts (default 250)
  timeoutMs?: number;        // default 15000
  cacheDir?: string;         // default data/raw/purdue/schedule
  refresh?: boolean;         // bypass the cache (fresh responses are still written)
  useCache?: boolean;        // false disables the disk cache (tests)
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: PurdueIoLogger;
}

export class PurdueIoHttpError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`purdue.io ${status} for ${url}`);
    this.name = 'PurdueIoHttpError';
  }
}

interface FetchedText { text: string; fetchedAt: string; fromCache: boolean }

export class PurdueIoSource implements ScheduleSource {
  readonly info = PURDUE_IO_SOURCE_INFO;
  readonly stats = { requests: 0, cacheHits: 0, retries: 0 };
  private readonly baseUrl: string;
  private readonly delayMs: number;
  private readonly timeoutMs: number;
  private readonly cacheDir: string;
  private readonly refresh: boolean;
  private readonly useCache: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly log: PurdueIoLogger;
  private lastStart = 0;
  private termsPromise: Promise<PurdueIoTerm[]> | null = null;
  /** Subject code → name, accumulated from every parsed response (feeds departments.json in the fetch script). */
  readonly subjectNames: Record<string, string> = {};

  constructor(opts: PurdueIoSourceOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_PURDUE_IO_BASE).replace(/\/+$/, '');
    this.delayMs = opts.delayMs ?? 250;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.cacheDir = path.resolve(opts.cacheDir ?? DEFAULT_PURDUE_SCHEDULE_CACHE_DIR);
    this.refresh = opts.refresh ?? false;
    this.useCache = opts.useCache ?? true;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => new Date());
    this.log = opts.log ?? { info: (m) => console.log(m), warn: (m) => console.warn(m) };
  }

  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{ term: TermCode; fetchedAt: string; sections: RawSection[] }> {
    if (opts.schoolId !== 'purdue') throw new Error(`PurdueIoSource only serves "purdue" (got "${opts.schoolId}")`);
    const subject = opts.subject.trim().toUpperCase();
    const resolved = await this.resolveTerm(opts.term);
    if (resolved.term !== opts.term) this.log.warn(`[purdue-io] ${opts.term} not listed; falling back to ${resolved.term} (${resolved.name})`);
    const filter = `Class/Term/Code eq '${resolved.code}' and Class/Course/Subject/Abbreviation eq '${subject.replace(/'/g, "''")}'`;
    const url = `${this.baseUrl}/Sections?$filter=${encodeURIComponent(filter)}&$expand=${encodeURIComponent(SECTIONS_EXPAND)}`;
    const got = await this.getText(url, this.cachePath(resolved.term, subject));
    const parsed = parseSectionsJson(JSON.parse(got.text), subject);
    Object.assign(this.subjectNames, parsed.subjectNames);
    this.log.info(`[purdue-io] ${subject} ${resolved.term} (${resolved.code}): ${parsed.sections.length} sections${got.fromCache ? ' (cache)' : ''}`);
    return { term: resolved.term, fetchedAt: got.fetchedAt, sections: parsed.sections };
  }

  /** Every term purdue.io lists (one request per source instance; never cached on disk). */
  async listTerms(): Promise<PurdueIoTerm[]> {
    if (!this.termsPromise) {
      this.termsPromise = this.getText(`${this.baseUrl}/Terms`, null).then((got) => parseTerms(JSON.parse(got.text)));
    }
    return this.termsPromise;
  }

  /** The requested term when listed, else the latest listed term before it. */
  async resolveTerm(requested: TermCode): Promise<PurdueIoTerm> {
    const terms = await this.listTerms();
    const pick = resolvePurdueTerm(requested, terms);
    if (!pick) throw new Error(`purdue.io lists no term ≤ ${requested} (${terms.length} terms seen)`);
    return pick;
  }

  cachePath(term: TermCode, subject: string): string {
    return path.join(this.cacheDir, term, `${subject}.json`);
  }

  private async getText(url: string, cacheFile: string | null): Promise<FetchedText> {
    if (cacheFile && this.useCache && !this.refresh) {
      try {
        const [text, st] = await Promise.all([readFile(cacheFile, 'utf8'), stat(cacheFile)]);
        this.stats.cacheHits += 1;
        return { text, fetchedAt: st.mtime.toISOString(), fromCache: true };
      } catch {
        /* cache miss */
      }
    }
    await this.politeDelay();
    const text = await this.fetchWithRetry(url);
    const fetchedAt = this.now().toISOString();
    if (cacheFile && this.useCache) {
      try {
        await mkdir(path.dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, text, 'utf8');
      } catch (err) {
        this.log.warn(`[purdue-io] could not write cache ${cacheFile}: ${(err as Error).message}`);
      }
    }
    return { text, fetchedAt, fromCache: false };
  }

  private async politeDelay(): Promise<void> {
    if (this.delayMs <= 0) return;
    const wait = this.lastStart + this.delayMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = Date.now();
  }

  private async fetchWithRetry(url: string): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      this.stats.requests += 1;
      try {
        const res = await this.fetchImpl(url, {
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: 'application/json', 'user-agent': PURDUE_USER_AGENT },
        });
        if (!res.ok) throw new PurdueIoHttpError(url, res.status);
        return await res.text();
      } catch (err) {
        if (!isRetryable(err) || attempt >= RETRY_BACKOFF_MS.length) throw err;
        this.stats.retries += 1;
        const delay = RETRY_BACKOFF_MS[attempt];
        this.log.warn(`[purdue-io] ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)} — retry ${attempt + 1}/${RETRY_BACKOFF_MS.length} in ${delay} ms`);
        await this.sleep(delay);
      }
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof PurdueIoHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof Error) return err.name === 'TimeoutError' || err.name === 'AbortError' || err.name === 'TypeError';
  return false;
}
