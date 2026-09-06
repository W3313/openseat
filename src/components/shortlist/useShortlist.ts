"use client";

import { useContext } from "react";
import { ShortlistContext, type ShortlistContextValue } from "./ShortlistProvider";
import { MAX_PICKS } from "./storage";

/** Inert value used when no `ShortlistProvider` is mounted (e.g. isolated component tests). */
const INERT: ShortlistContextValue = {
  picks: [],
  ready: false,
  persistent: false,
  max: MAX_PICKS,
  isPicked: () => false,
  isFull: () => false,
  picksFor: () => [],
  toggle: () => null,
  add: () => {},
  remove: () => {},
  clear: () => {},
};

/**
 * Access the shortlist (SPEC F16). Safe to call outside the provider: the hook then returns an inert
 * value with `ready: false`, so `ShortlistButton` renders disabled instead of crashing.
 */
export function useShortlist(): ShortlistContextValue {
  return useContext(ShortlistContext) ?? INERT;
}

export default useShortlist;
