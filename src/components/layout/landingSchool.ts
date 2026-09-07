"use client";

// The school chosen in the landing hero form (design §8: header badge and footer provenance are per school).
// `/` has no school in its URL, so the form publishes its selection through this tiny external store and
// `useSchoolChrome` reads it via useSyncExternalStore. Module-level state is fine: it lives only for the page
// session, the server snapshot is always null (no hydration mismatch), and HeroForm clears it on unmount.
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

/** Publish the school selected on the landing page (null when the hero form unmounts). */
export function setLandingSchool(id: string | null): void {
  if (current === id) return;
  current = id;
  for (const l of listeners) l();
}

export function getLandingSchool(): string | null {
  return current;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getServerSnapshot = (): string | null => null;

/** The school id chosen in the hero form, or null (server render, other pages). */
export function useLandingSchool(): string | null {
  return useSyncExternalStore(subscribe, getLandingSchool, getServerSnapshot);
}
