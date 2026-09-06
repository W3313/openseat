// Pure shortlist state helpers (SPEC F16). No React, no window access: every function takes the
// storage-like object it should use so it can be unit-tested and so the browser code can wrap the
// real `localStorage` in try/catch (SPEC risk #23: private mode → in-memory fallback).
import { parsePicks, serializePicks } from "@/lib/utils/urlState";

/** Versioned key — bump the `v1` when the stored shape changes. */
export const SHORTLIST_KEY = "profpeek:v1:picks";
/** Compare shows 2–3 professors side by side (SPEC 3.5), so the shortlist holds at most 3 per school. */
export const MAX_PICKS = 3;
/** Compare needs at least this many picks. */
export const MIN_COMPARE_PICKS = 2;

export interface ShortlistPick {
  schoolId: string;
  slug: string;
  /** Filled by `ShortlistButton` when known; a pick that arrived via a share URL may lack it. */
  displayName?: string;
  /** Primary subject code, for the drawer caption. */
  subject?: string;
}

/** What callers pass to add/toggle: a `Professor` satisfies it, so does a stored `ShortlistPick`. */
export type PickInput = { slug: string; schoolId: string; displayName?: string; subject?: string };

interface StoredShape {
  version: 1;
  picks: ShortlistPick[];
}

/** Minimal storage surface (a `Storage`, or an in-memory stand-in). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPick(value: unknown): value is ShortlistPick {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.schoolId === "string" && typeof v.slug === "string" && SLUG_RE.test(v.slug);
}

/** Parse a stored JSON string defensively; anything malformed yields []. */
export function parseStoredPicks(json: string | null): ShortlistPick[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Partial<StoredShape> | unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as Partial<StoredShape>)?.picks;
    if (!Array.isArray(list)) return [];
    const out: ShortlistPick[] = [];
    for (const item of list) {
      if (!isPick(item)) continue;
      if (out.some((p) => p.schoolId === item.schoolId && p.slug === item.slug)) continue;
      const pick: ShortlistPick = { schoolId: item.schoolId, slug: item.slug };
      if (typeof item.displayName === "string") pick.displayName = item.displayName;
      if (typeof item.subject === "string") pick.subject = item.subject;
      out.push(pick);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeStoredPicks(picks: readonly ShortlistPick[]): string {
  const shape: StoredShape = { version: 1, picks: [...picks] };
  return JSON.stringify(shape);
}

/** Read picks from storage; never throws (returns [] when storage is unavailable or corrupt). */
export function readPicks(storage: StorageLike | null | undefined): ShortlistPick[] {
  if (!storage) return [];
  try {
    return parseStoredPicks(storage.getItem(SHORTLIST_KEY));
  } catch {
    return [];
  }
}

/** Write picks to storage; returns false (and swallows the error) when storage is unavailable. */
export function writePicks(storage: StorageLike | null | undefined, picks: readonly ShortlistPick[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SHORTLIST_KEY, serializeStoredPicks(picks));
    return true;
  } catch {
    return false;
  }
}

export function isPicked(picks: readonly ShortlistPick[], schoolId: string, slug: string): boolean {
  return picks.some((p) => p.schoolId === schoolId && p.slug === slug);
}

export function picksForSchool(picks: readonly ShortlistPick[], schoolId: string): ShortlistPick[] {
  return picks.filter((p) => p.schoolId === schoolId);
}

/** True when another pick for this school would exceed `MAX_PICKS`. */
export function isFull(picks: readonly ShortlistPick[], schoolId: string, max = MAX_PICKS): boolean {
  return picksForSchool(picks, schoolId).length >= max;
}

/** Add (or update the metadata of) a pick. Returns the same array when the school is already full. */
export function addPick(picks: readonly ShortlistPick[], input: PickInput, max = MAX_PICKS): ShortlistPick[] {
  const existing = picks.findIndex((p) => p.schoolId === input.schoolId && p.slug === input.slug);
  const pick: ShortlistPick = { schoolId: input.schoolId, slug: input.slug };
  if (input.displayName) pick.displayName = input.displayName;
  if (input.subject) pick.subject = input.subject;
  if (existing >= 0) {
    const next = [...picks];
    next[existing] = { ...next[existing], ...pick };
    return next;
  }
  if (isFull(picks, input.schoolId, max)) return [...picks];
  return [...picks, pick];
}

export function removePick(picks: readonly ShortlistPick[], schoolId: string, slug: string): ShortlistPick[] {
  return picks.filter((p) => !(p.schoolId === schoolId && p.slug === slug));
}

/** Toggle membership; adding into a full school is a no-op (the caller shows a toast). */
export function togglePick(picks: readonly ShortlistPick[], input: PickInput, max = MAX_PICKS): ShortlistPick[] {
  return isPicked(picks, input.schoolId, input.slug) ? removePick(picks, input.schoolId, input.slug) : addPick(picks, input, max);
}

export function clearSchool(picks: readonly ShortlistPick[], schoolId: string): ShortlistPick[] {
  return picks.filter((p) => p.schoolId !== schoolId);
}

/**
 * Merge `picks=` slugs from a shared URL into the stored list (SPEC F17: the share URL carries picks,
 * so a link opened in another browser reconstructs the shortlist). URL picks come first; the school's
 * cap still applies.
 */
export function mergeUrlPicks(picks: readonly ShortlistPick[], search: string | URLSearchParams, schoolId: string, max = MAX_PICKS): ShortlistPick[] {
  const slugs = parsePicks(search, "picks");
  if (slugs.length === 0) return [...picks];
  const others = picks.filter((p) => p.schoolId !== schoolId);
  const mine = picksForSchool(picks, schoolId);
  const merged: ShortlistPick[] = [];
  for (const slug of slugs) {
    if (merged.length >= max) break;
    merged.push(mine.find((p) => p.slug === slug) ?? { schoolId, slug });
  }
  for (const p of mine) {
    if (merged.length >= max) break;
    if (!merged.some((m) => m.slug === p.slug)) merged.push(p);
  }
  return [...others, ...merged];
}

/** Rewrite the `picks=` key of a query string to match the school's picks (null → key removed). */
export function withPicksParam(search: string | URLSearchParams, picks: readonly ShortlistPick[], schoolId: string): URLSearchParams {
  const params = new URLSearchParams(typeof search === "string" ? search.replace(/^\?/, "") : search);
  const value = serializePicks(picksForSchool(picks, schoolId).map((p) => p.slug));
  if (value) params.set("picks", value);
  else params.delete("picks");
  return params;
}

/** `/s/uiuc/CS`, `/p/uiuc/x`, `/compare/uiuc` → "uiuc"; null elsewhere. */
export function schoolIdFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = /^\/(?:s|p|compare)\/([a-z0-9-]+)(?:\/|$)/i.exec(pathname);
  return m ? m[1].toLowerCase() : null;
}
