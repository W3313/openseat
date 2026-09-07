// Which school a pathname belongs to (design §8: header badge and footer provenance are per school).
// The root layout renders once for every route, so the client chrome reads the school id from the
// URL: `/s/<school>/…`, `/p/<school>/…`, `/compare/<school>`. Anything else (`/`, `/about`) → null.

const SCHOOL_PATH_RE = /^\/(?:s|p|compare)\/([^/?#]+)/;

/** "/s/uiuc/CS?sort=gpa" → "uiuc"; "/about" → null. Lower-cased and URL-decoded. */
export function schoolFromPathname(pathname: string | null | undefined): string | null {
  const m = SCHOOL_PATH_RE.exec(pathname ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

/**
 * Pick the record for the pathname's school, falling back to the default school. Own-property lookup:
 * a path segment such as `constructor` must never reach `Object.prototype`.
 */
export function pickBySchool<T>(byId: Readonly<Record<string, T>>, pathname: string | null | undefined, defaultId: string): T | null {
  const id = schoolFromPathname(pathname);
  if (id && Object.hasOwn(byId, id)) return byId[id];
  return Object.hasOwn(byId, defaultId) ? byId[defaultId] : null;
}
