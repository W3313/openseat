import clsx from "clsx";

export interface CourseNumberInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}

/** Keep digits only, max 3 (UIUC course numbers are 3 digits). */
export function sanitizeCourseNumber(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 3);
}

/** True when the value is a complete 3-digit course number. */
export function isCompleteCourseNumber(value: string): boolean {
  return /^\d{3}$/.test(value);
}

/**
 * Optional "Have a course number?" field (F1). Numeric, 3 digits; the value is
 * appended to the rankings URL as `?course=NNN` when complete.
 */
export function CourseNumberInput({ value, onChange, id = "hero-course", className }: CourseNumberInputProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        Course number <span className="font-normal text-ink-faint">(optional)</span>
      </label>
      <input
        id={id}
        name="course"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{3}"
        maxLength={3}
        autoComplete="off"
        placeholder="Course # (optional), e.g. 225"
        value={value}
        onChange={(e) => onChange(sanitizeCourseNumber(e.target.value))}
        aria-describedby={`${id}-hint`}
        className={clsx(
          "h-11 w-full rounded-lg border border-border-strong bg-surface-raised px-3 text-base text-ink",
          "placeholder:text-ink-faint focus:border-brand",
        )}
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">
        Narrows the ranking to one course, e.g. 225.
      </p>
    </div>
  );
}

export default CourseNumberInput;
