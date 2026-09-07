// Subject → review-source department names (data/config/{school}/departments.json), e.g.
// { "CS": ["Computer Science"], "ECE": ["Electrical and Computer Engineering", ...] }. Used by the RMP
// adapter (teacher search text) and by ingest for subject names.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SchoolId } from '@/lib/domain/types';

export type DepartmentMap = Record<string, string[]>;

const DepartmentMapSchema = z.record(z.string(), z.array(z.string()));

export function departmentsPath(schoolId: SchoolId): string {
  return path.join(process.cwd(), 'data', 'config', schoolId, 'departments.json');
}

/** Sync read (small committed file). Throws when missing or malformed. */
export function loadDepartments(schoolId: SchoolId, file = departmentsPath(schoolId)): DepartmentMap {
  const parsed = DepartmentMapSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const out: DepartmentMap = {};
  for (const [subject, names] of Object.entries(parsed)) out[subject.toUpperCase()] = names;
  return out;
}

/** Department names for a subject list (deduped, in subject order). Unknown subjects contribute nothing. */
export function departmentsFor(map: DepartmentMap, subjects: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of subjects) for (const d of map[s.toUpperCase()] ?? []) if (!out.includes(d)) out.push(d);
  return out;
}

/** Subject whose department list contains `department` (case-insensitive), or null. */
export function subjectForDepartment(map: DepartmentMap, department: string | null | undefined): string | null {
  if (!department) return null;
  const needle = department.trim().toLowerCase();
  for (const [subject, names] of Object.entries(map)) {
    if (names.some((n) => n.trim().toLowerCase() === needle)) return subject;
  }
  return null;
}
