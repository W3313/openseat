// Professor records: reviewed (from the review source) and grades-only (from unmatched grade strings).
// SPEC 6.3 step 3-4, 5.1 slugs, 7.4 step 5.
import type { NameKey, Professor, SchoolId } from '@/lib/domain/types';
import { displayNameFromRaw } from '@/lib/matching/parseName';
import type { RawProfessor } from '@/lib/sources/types';
import { makeProfessorId } from '@/lib/utils/ids';
import { gradesOnlySlug, reviewedSlug, uniqueSlug } from '@/lib/utils/slug';
import { nameKeyFromFields } from '@/lib/matching';

/** department string → subject codes, from data/config/<school>/departments.json ({ CS: ["Computer Science"] }). */
export type DepartmentIndex = ReadonlyMap<string, readonly string[]>;

export function buildDepartmentIndex(departments: Readonly<Record<string, readonly string[]>>): DepartmentIndex {
  const index = new Map<string, string[]>();
  for (const [subject, names] of Object.entries(departments)) {
    for (const name of names) {
      const key = name.trim().toLowerCase();
      const list = index.get(key) ?? [];
      if (!list.includes(subject)) list.push(subject);
      index.set(key, list);
    }
  }
  return index;
}

export interface BuildReviewedResult {
  professors: Professor[];
  /** sourceId → professorId */
  bySourceId: Map<string, string>;
}

/**
 * Reviewed professors: slug = slugify(first + ' ' + last) made unique with -2/-3 suffixes in a stable
 * order (sorted by last, first, sourceId). `subjects` is seeded from the department mapping so the
 * matcher's subject scope has something to work with before any grade row is linked.
 */
export function buildReviewedProfessors(
  raw: readonly RawProfessor[],
  schoolId: SchoolId,
  departments: DepartmentIndex,
  taken: Set<string>,
): BuildReviewedResult {
  const sorted = [...raw].sort((a, b) =>
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.sourceId.localeCompare(b.sourceId),
  );
  const professors: Professor[] = [];
  const bySourceId = new Map<string, string>();
  for (const p of sorted) {
    if (bySourceId.has(p.sourceId)) continue;
    const firstName = p.firstName.trim();
    const lastName = p.lastName.trim();
    const slug = uniqueSlug(reviewedSlug(firstName, lastName) || 'professor', taken);
    taken.add(slug);
    const id = makeProfessorId(schoolId, 'reviewed', slug);
    const department = p.department?.trim() || null;
    const subjects = department ? [...(departments.get(department.toLowerCase()) ?? [])] : [];
    professors.push({
      id,
      schoolId,
      slug,
      kind: 'reviewed',
      displayName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      nameKey: nameKeyFromFields(firstName, lastName),
      department,
      subjects,
      courseIds: [],
      nameVariants: [],
      reviewSourceId: p.sourceId,
      isFictional: p.isFictional,
    });
    bySourceId.set(p.sourceId, id);
  }
  return { professors, bySourceId };
}

/** Merge key for grades-only entities: strings with the same (lastCompact, firstToken) are one person. */
export function gradesOnlyKey(key: NameKey): string {
  return `${key.lastCompact}|${key.firstToken}`;
}

/**
 * Reconstruct "First Last" from a raw "Last, First M" string keeping the source casing/diacritics:
 * "Okonkwo, J" → "J. Okonkwo"; "Smyth, Robert" → "Robert Smyth"; "Patel" → "Patel".
 */
export function gradesOnlyNames(raw: string): { firstName: string; lastName: string; displayName: string } {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(',');
  if (comma < 0) {
    if (!/\s/.test(trimmed)) return { firstName: '', lastName: trimmed, displayName: trimmed }; // "Patel" → surname only
    const r = displayNameFromRaw(trimmed); // "Priya Patel" → first/last per the matcher, not the whole string as a surname
    return { firstName: r.firstName, lastName: r.lastName, displayName: r.displayName };
  }
  const lastName = trimmed.slice(0, comma).trim();
  const firstPart = trimmed.slice(comma + 1).trim();
  const firstToken = firstPart.split(/\s+/)[0] ?? '';
  const first = firstToken.replace(/\.$/, '');
  const firstName = first.length === 1 ? `${first.toUpperCase()}.` : first;
  const displayName = firstName ? `${firstName} ${lastName}` : lastName;
  return { firstName: first, lastName, displayName };
}

/** Create a grades-only Professor for one unmatched/ambiguous name key (slug made unique against `taken`). */
export function createGradesOnlyProfessor(
  key: NameKey,
  schoolId: SchoolId,
  taken: Set<string>,
  isFictional: boolean,
): Professor {
  const names = gradesOnlyNames(key.raw);
  const slug = uniqueSlug(gradesOnlySlug(key.lastCompact, key.firstToken) || 'instructor', taken);
  taken.add(slug);
  return {
    id: makeProfessorId(schoolId, 'grades-only', slug),
    schoolId,
    slug,
    kind: 'grades-only',
    displayName: names.displayName,
    firstName: names.firstName,
    lastName: names.lastName,
    nameKey: key,
    department: null,
    subjects: [],
    courseIds: [],
    nameVariants: [key.raw],
    reviewSourceId: null,
    isFictional,
  };
}

/** Sorted, deduped string union helper for subjects/courseIds/nameVariants. */
export function addAll(target: string[], values: Iterable<string>): void {
  for (const v of values) if (!target.includes(v)) target.push(v);
}
