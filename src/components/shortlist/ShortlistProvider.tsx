"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  MAX_PICKS,
  SHORTLIST_KEY,
  addPick,
  clearSchool,
  isFull,
  isPicked,
  mergeUrlPicks,
  picksForSchool,
  readPicks,
  removePick,
  schoolIdFromPathname,
  togglePick,
  withPicksParam,
  writePicks,
  type PickInput,
  type ShortlistPick,
  type StorageLike,
} from "./storage";

export interface ShortlistContextValue {
  /** Every pick across schools (persisted). */
  picks: ShortlistPick[];
  /** False until the first client render has read localStorage (avoids hydration mismatches). */
  ready: boolean;
  /** Whether localStorage accepted the last write; false in private mode (picks then live in memory + URL). */
  persistent: boolean;
  max: number;
  isPicked(schoolId: string, slug: string): boolean;
  isFull(schoolId: string): boolean;
  picksFor(schoolId: string): ShortlistPick[];
  /** Toggle membership. Returns the resulting membership, or null when the school is full and nothing changed. */
  toggle(input: PickInput): boolean | null;
  add(input: PickInput): void;
  remove(schoolId: string, slug: string): void;
  clear(schoolId: string): void;
}

export const ShortlistContext = createContext<ShortlistContextValue | null>(null);

function safeStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    // Accessing localStorage can itself throw (blocked site data); a round-trip proves it works.
    const probe = `${SHORTLIST_KEY}:probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export interface ShortlistProviderProps {
  children: ReactNode;
  /** Test hook: storage to use instead of `window.localStorage`. */
  storage?: StorageLike | null;
  /** Test hook: initial `location.search` to merge picks from. */
  initialSearch?: string;
}

/**
 * Holds the "My picks" shortlist (SPEC F16): localStorage under a versioned key with try/catch
 * everywhere, hydrated after mount, kept in sync across tabs, and mirrored into the `picks=` query
 * key on rankings pages so a copied link carries the shortlist (SPEC F17).
 */
export function ShortlistProvider({ children, storage: storageProp, initialSearch }: ShortlistProviderProps) {
  const pathname = usePathname();
  const [picks, setPicks] = useState<ShortlistPick[]>([]);
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const storageRef = useRef<StorageLike | null>(null);
  const hydrated = useRef(false);

  // 1. Hydrate from storage + the share URL once on the client.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const storage = storageProp === undefined ? safeStorage() : storageProp;
    storageRef.current = storage;
    setPersistent(storage !== null);
    let initial = readPicks(storage);
    const schoolId = schoolIdFromPathname(pathname);
    const search = initialSearch ?? (typeof window !== "undefined" ? window.location.search : "");
    if (schoolId && search) initial = mergeUrlPicks(initial, search, schoolId);
    setPicks(initial);
    setReady(true);
  }, [pathname, storageProp, initialSearch]);

  // 2. Persist every change (after hydration) and mirror into the URL on rankings pages.
  useEffect(() => {
    if (!ready) return;
    const ok = writePicks(storageRef.current, picks);
    if (storageRef.current && !ok) setPersistent(false);
    if (typeof window === "undefined" || !pathname?.startsWith("/s/")) return;
    const schoolId = schoolIdFromPathname(pathname);
    if (!schoolId) return;
    try {
      const params = withPicksParam(window.location.search, picks, schoolId);
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) window.history.replaceState(window.history.state, "", next);
    } catch {
      /* URL mirroring is best-effort */
    }
  }, [picks, ready, pathname]);

  // 3. Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key !== SHORTLIST_KEY) return;
      setPicks(readPicks(storageRef.current));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback(
    (input: PickInput): boolean | null => {
      if (!isPicked(picks, input.schoolId, input.slug) && isFull(picks, input.schoolId)) return null;
      const next = togglePick(picks, input);
      setPicks(next);
      return isPicked(next, input.schoolId, input.slug);
    },
    [picks],
  );

  const add = useCallback((input: PickInput) => setPicks((prev) => addPick(prev, input)), []);
  const remove = useCallback((schoolId: string, slug: string) => setPicks((prev) => removePick(prev, schoolId, slug)), []);
  const clear = useCallback((schoolId: string) => setPicks((prev) => clearSchool(prev, schoolId)), []);

  const value = useMemo<ShortlistContextValue>(
    () => ({
      picks,
      ready,
      persistent,
      max: MAX_PICKS,
      isPicked: (schoolId, slug) => isPicked(picks, schoolId, slug),
      isFull: (schoolId) => isFull(picks, schoolId),
      picksFor: (schoolId) => picksForSchool(picks, schoolId),
      toggle,
      add,
      remove,
      clear,
    }),
    [picks, ready, persistent, toggle, add, remove, clear],
  );

  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export default ShortlistProvider;
