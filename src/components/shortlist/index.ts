// Shortlist / compare components (SPEC F16). Import from "@/components/shortlist".
export { ShortlistProvider, ShortlistContext } from "./ShortlistProvider";
export type { ShortlistProviderProps, ShortlistContextValue } from "./ShortlistProvider";
export { useShortlist } from "./useShortlist";
export { ShortlistButton } from "./ShortlistButton";
export type { ShortlistButtonProps } from "./ShortlistButton";
export { ShortlistDrawer } from "./ShortlistDrawer";
export type { ShortlistDrawerProps } from "./ShortlistDrawer";
export { CompareTable, BEST_CELL_CLASS } from "./CompareTable";
export type { CompareTableProps } from "./CompareTable";
export { NUMERIC_ROWS, bestIndexes, openSectionCount, orderBySlugs } from "./compareRows";
export type { NumericRowDef, BestDirection } from "./compareRows";
export {
  SHORTLIST_KEY,
  MAX_PICKS,
  MIN_COMPARE_PICKS,
  parseStoredPicks,
  serializeStoredPicks,
  readPicks,
  writePicks,
  isPicked,
  isFull,
  picksForSchool,
  addPick,
  removePick,
  togglePick,
  clearSchool,
  mergeUrlPicks,
  withPicksParam,
  schoolIdFromPathname,
} from "./storage";
export type { ShortlistPick, PickInput, StorageLike } from "./storage";
