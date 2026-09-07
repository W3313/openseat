// cougargrades/publicdata release bundle helpers (MULTI_SCHOOL_DESIGN §4.2 row `uh`, §7): resolve the
// latest GitHub release, pick `publicdata-bundle.tar.gz`, and pull single files out of the .tar.gz without
// a tar dependency (ustar / pax headers, 512-byte blocks; the bundle is written by Python's tarfile).
import { gunzipSync } from 'node:zlib';

/** Descriptive User-Agent every raw download and API call identifies itself with. */
export const USER_AGENT = 'ProfPeek/1.0 (+https://github.com/W3313/profpeek)';

export const PUBLICDATA_LATEST_RELEASE_URL = 'https://api.github.com/repos/cougargrades/publicdata/releases/latest';
export const PUBLICDATA_BUNDLE_ASSET = 'publicdata-bundle.tar.gz';
/** Bundle entries the pipeline needs. */
export const BUNDLE_RECORDS_CSV = 'edu.uh.grade_distribution/records.csv';
export const BUNDLE_SUBJECTS_JSON = 'edu.uh.publications.subjects/subjects.json';

export interface ReleaseInfo {
  tag: string;
  publishedAt: string | null;
  htmlUrl: string | null;
  asset: { name: string; url: string; size: number | null };
}

/** GitHub "latest release" body → the bundle asset. Throws when the asset is missing. */
export function parseReleaseJson(body: unknown, assetName = PUBLICDATA_BUNDLE_ASSET): ReleaseInfo {
  const rel = isRecord(body) ? body : {};
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = assets.find((a) => isRecord(a) && a.name === assetName);
  if (!isRecord(asset) || typeof asset.browser_download_url !== 'string') {
    throw new Error(`release ${String(rel.tag_name ?? '?')} has no asset named ${assetName}`);
  }
  return {
    tag: String(rel.tag_name ?? ''),
    publishedAt: typeof rel.published_at === 'string' ? rel.published_at : null,
    htmlUrl: typeof rel.html_url === 'string' ? rel.html_url : null,
    asset: { name: assetName, url: asset.browser_download_url, size: typeof asset.size === 'number' ? asset.size : null },
  };
}

export async function resolveLatestRelease(fetchImpl: typeof fetch = fetch, url = PUBLICDATA_LATEST_RELEASE_URL): Promise<ReleaseInfo> {
  const res = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub releases API returned HTTP ${res.status} for ${url}`);
  return parseReleaseJson(await res.json());
}

const BLOCK = 512;

/** Text up to the first NUL byte. */
function untilNul(text: string): string {
  const nul = text.indexOf('\0');
  return nul < 0 ? text : text.slice(0, nul);
}

function octal(buf: Uint8Array, start: number, length: number): number {
  const text = untilNul(Buffer.from(buf.subarray(start, start + length)).toString('ascii')).trim();
  return text === '' ? 0 : parseInt(text, 8);
}

function cstr(buf: Uint8Array, start: number, length: number): string {
  return untilNul(Buffer.from(buf.subarray(start, start + length)).toString('utf8'));
}

/** pax extended header body ("<len> path=<value>\n…") → the `path` override, if any. */
function paxPath(body: Uint8Array): string | null {
  const text = Buffer.from(body).toString('utf8');
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(' ', i);
    if (sp < 0) break;
    const len = Number(text.slice(i, sp));
    if (!Number.isFinite(len) || len <= 0) break;
    const record = text.slice(sp + 1, i + len - 1);
    if (record.startsWith('path=')) return record.slice(5);
    i += len;
  }
  return null;
}

/**
 * Entries of an uncompressed tar whose names are in `wanted` → their bytes. Handles ustar prefixes, pax
 * (`x`) and GNU long-name (`L`) headers; directories and other types are skipped.
 */
export function extractTarEntries(tar: Uint8Array, wanted: ReadonlySet<string>): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let pos = 0;
  let nextName: string | null = null;
  while (pos + BLOCK <= tar.length) {
    const header = tar.subarray(pos, pos + BLOCK);
    if (header.every((b) => b === 0)) break; // end-of-archive zero block
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = pos + BLOCK;
    const dataEnd = dataStart + size;
    const magic = cstr(header, 257, 6);
    let name = cstr(header, 0, 100);
    const prefix = magic.startsWith('ustar') ? cstr(header, 345, 155) : '';
    if (prefix !== '') name = `${prefix}/${name}`;
    if (type === 'L') {
      nextName = cstr(tar.subarray(dataStart, dataEnd), 0, size);
    } else if (type === 'x') {
      nextName = paxPath(tar.subarray(dataStart, dataEnd)) ?? nextName;
    } else {
      if (nextName !== null) {
        name = nextName;
        nextName = null;
      }
      const normalized = name.replace(/^\.\//, '');
      if ((type === '0' || type === '\0') && wanted.has(normalized)) out.set(normalized, Buffer.from(tar.subarray(dataStart, dataEnd)));
    }
    pos = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return out;
}

/** .tar.gz bytes → the wanted entries (gunzipped in memory; the bundle is ≈ 12 MB compressed). */
export function extractTarGzEntries(gz: Uint8Array, wanted: ReadonlySet<string>): Map<string, Buffer> {
  return extractTarEntries(gunzipSync(gz), wanted);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
