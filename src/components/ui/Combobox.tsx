"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";

export interface ComboboxProps<T> {
  /** Visible label. Use `labelHidden` to keep it for screen readers only. */
  label: string;
  labelHidden?: boolean;
  options: readonly T[];
  /** Stable unique key per option (used for `id`s and equality). */
  getKey: (option: T) => string;
  /** Text shown in the input after selection; also the default filter target. */
  getLabel: (option: T) => string;
  /** Extra searchable text (e.g. the subject name) joined with the label. */
  getSearchText?: (option: T) => string;
  /** Custom option row. Defaults to `getLabel`. */
  renderOption?: (option: T, state: { active: boolean; selected: boolean }) => ReactNode;
  /** Custom filter; default = case-insensitive substring over label + search text. */
  filter?: (option: T, query: string) => boolean;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Fires on every keystroke with the raw text. */
  onInputChange?: (text: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Cap rendered options (performance on large lists). Default 50. */
  maxVisible?: number;
  /** Message when nothing matches. */
  emptyMessage?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Default ranking: 0 = label starts with the query, 1 = a word of the search
 * text starts with it, 2 = substring anywhere, -1 = no match. Typing "cs"
 * therefore puts "CS" above "Mathematics" and "Statistics".
 */
function defaultRank(label: string, searchText: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (q === "") return 2;
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  const words = `${l} ${searchText.toLowerCase()}`.split(/[\s·,/-]+/);
  if (words.some((w) => w.startsWith(q))) return 1;
  if (`${l} ${searchText.toLowerCase()}`.includes(q)) return 2;
  return -1;
}

/**
 * Generic typeahead combobox (WAI-ARIA 1.2 pattern, list autocomplete):
 * `role="combobox"` input with `aria-expanded`, `aria-controls`,
 * `aria-activedescendant`; a `role="listbox"` of `role="option"`s.
 * Keys: ArrowDown/Up move (and open), Home/End jump, Enter selects the active
 * option (or, when the list is closed / nothing is active, falls through so an
 * enclosing form submits), Escape closes, Tab closes without selecting.
 */
export function Combobox<T>({
  label,
  labelHidden,
  options,
  getKey,
  getLabel,
  getSearchText,
  renderOption,
  filter,
  value,
  onChange,
  onInputChange,
  placeholder,
  id: idProp,
  name,
  autoFocus,
  disabled,
  required,
  maxVisible = 50,
  emptyMessage = "No matches",
  className,
  inputClassName,
}: ComboboxProps<T>) {
  const autoId = useId();
  const id = idProp ?? `combobox-${autoId}`;
  const listId = `${id}-listbox`;
  const labelId = `${id}-label`;

  const [text, setText] = useState(value ? getLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedKey = value ? getKey(value) : null;

  // Keep the input text in sync when the selection changes from outside.
  const lastValueKey = useRef(selectedKey);
  useEffect(() => {
    if (lastValueKey.current !== selectedKey) {
      lastValueKey.current = selectedKey;
      setText(value ? getLabel(value) : "");
    }
  }, [selectedKey, value, getLabel]);

  const filtered = useMemo(() => {
    const q = text;
    // When the text is exactly the selected label, show the whole list so the
    // user can browse alternatives after picking one.
    const browsing = value !== null && q === getLabel(value);
    if (q.trim() === "" || browsing) return options.slice(0, maxVisible);
    if (filter) return options.filter((o) => filter(o, q)).slice(0, maxVisible);
    const ranked: { o: T; rank: number; i: number }[] = [];
    options.forEach((o, i) => {
      const rank = defaultRank(getLabel(o), getSearchText?.(o) ?? "", q);
      if (rank >= 0) ranked.push({ o, rank, i });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.i - b.i);
    return ranked.slice(0, maxVisible).map((r) => r.o);
  }, [options, text, value, getLabel, getSearchText, filter, maxVisible]);

  const optionId = useCallback((o: T) => `${id}-opt-${getKey(o)}`, [id, getKey]);

  const commit = useCallback(
    (o: T) => {
      onChange(o);
      setText(getLabel(o));
      setOpen(false);
      setActiveIndex(-1);
    },
    [onChange, getLabel],
  );

  // Scroll the active option into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.children.item(activeIndex) as HTMLElement | null;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  function move(delta: number) {
    if (filtered.length === 0) return;
    if (!open) {
      setOpen(true);
      setActiveIndex(delta > 0 ? 0 : filtered.length - 1);
      return;
    }
    const next = activeIndex < 0 ? (delta > 0 ? 0 : filtered.length - 1) : activeIndex + delta;
    setActiveIndex(Math.max(0, Math.min(filtered.length - 1, next)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(filtered.length - 1);
        }
        break;
      case "Enter":
        if (open && activeIndex >= 0 && filtered[activeIndex] !== undefined) {
          e.preventDefault();
          commit(filtered[activeIndex]);
        } else if (open && filtered.length === 1) {
          // A single remaining match is an unambiguous choice.
          e.preventDefault();
          commit(filtered[0]);
        }
        // otherwise fall through so a surrounding <form> submits
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const activeOption = open && activeIndex >= 0 ? filtered[activeIndex] : undefined;

  return (
    <div className={clsx("relative", className)}>
      <label
        id={labelId}
        htmlFor={id}
        className={clsx(labelHidden ? "sr-only" : "mb-1 block text-sm font-medium text-ink")}
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeOption ? optionId(activeOption) : undefined}
        aria-labelledby={labelId}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        required={required}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          onInputChange?.(next);
          setOpen(true);
          setActiveIndex(next.trim() === "" ? -1 : 0);
          if (value !== null && next !== getLabel(value)) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
        className={clsx(
          "h-11 w-full rounded-lg border border-border-strong bg-surface-raised px-3 text-base text-ink",
          "placeholder:text-ink-faint focus:border-brand",
          "disabled:opacity-50",
          inputClassName,
        )}
      />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        hidden={!open}
        className={clsx(
          "absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface-overlay py-1 shadow-overlay",
        )}
      >
        {filtered.length === 0 ? (
          <li role="presentation" className="px-3 py-2 text-sm text-ink-muted">
            {emptyMessage}
          </li>
        ) : (
          filtered.map((o, i) => {
            const key = getKey(o);
            const active = i === activeIndex;
            const selected = key === selectedKey;
            return (
              <li
                key={key}
                id={optionId(o)}
                role="option"
                aria-selected={selected}
                // mousedown (not click) so the input's blur does not close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(o);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={clsx(
                  "cursor-pointer px-3 py-2 text-sm text-ink",
                  active && "bg-brand-soft",
                  selected && "font-semibold",
                )}
              >
                {renderOption ? renderOption(o, { active, selected }) : getLabel(o)}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export default Combobox;
