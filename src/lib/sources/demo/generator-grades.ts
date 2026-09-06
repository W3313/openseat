// Grade rows for the demo seed (SPEC 6.5 "Grade rows") + the exact 23-column gpa.csv writer.
import type { GradeBuckets } from '@/lib/domain/types';
import type { RawGradeRow } from '@/lib/sources/types';
import { clamp } from '@/lib/utils/seededRandom';
import type { SeededRandom } from '@/lib/utils/seededRandom';
import { edgeCase } from './edgeCases';
import type { EdgeCaseRecord } from './edgeCases';
import type { CoursePrior, DemoProfessor, LetterKey, NameForm } from './generator-types';
import { GPA_CSV_HEADER, LETTER_KEYS, LETTER_LABELS, cmp } from './generator-types';
import { rawFull, rawHyphenVariant, rawInitial, rawNickname, rawStripped, rawSuffix } from './names';
import type { FullName } from './names';

/**
 * Letter-only shares (W excluded) after applying leniency: a fraction |leniency| of each bucket's mass
 * moves one letter step up (leniency > 0) or down (leniency < 0). Deterministic — no PRNG draw.
 */
export function leniencyShares(prior: CoursePrior, leniency: number): number[] {
  const base = LETTER_KEYS.map((k) => Math.max(0, prior.bucketShares[k]));
  const total = base.reduce((a, b) => a + b, 0) || 1;
  const shares = base.map((v) => v / total);
  const move = Math.abs(leniency);
  const out = [...shares];
  for (let i = 0; i < shares.length; i++) {
    const target = leniency > 0 ? i - 1 : i + 1;      // index 0 is A+ (up = lower index)
    if (target < 0 || target >= shares.length) continue;
    const mass = shares[i] * move;
    out[i] -= mass;
    out[target] += mass;
  }
  return out;
}

/** Add per-bucket noise, clamp, renormalize, then multinomial-draw `graded` students. */
export function drawLetterCounts(rng: SeededRandom, shares: readonly number[], graded: number): Record<LetterKey, number> {
  const noisy = shares.map((s) => Math.max(0, s + rng.normal(0, 0.03)));
  const total = noisy.reduce((a, b) => a + b, 0) || 1;
  const cumulative: number[] = [];
  let acc = 0;
  for (const s of noisy) { acc += s / total; cumulative.push(acc); }
  const counts = LETTER_KEYS.map(() => 0);
  for (let i = 0; i < graded; i++) {
    const r = rng.float();
    let idx = cumulative.findIndex((c) => r < c);
    if (idx < 0) idx = counts.length - 1;
    counts[idx]++;
  }
  const out = {} as Record<LetterKey, number>;
  LETTER_KEYS.forEach((k, i) => { out[k] = counts[i]; });
  return out;
}

/** Sample one letter grade label ("A-") from leniency-shifted shares. */
export function drawLetter(rng: SeededRandom, shares: readonly number[]): string {
  const key = rng.weightedPick(LETTER_KEYS, shares.map((s) => Math.max(s, 1e-9)));
  return LETTER_LABELS[key];
}

export function buildBuckets(rng: SeededRandom, prior: CoursePrior, leniency: number, graded: number): GradeBuckets {
  const letters = drawLetterCounts(rng, leniencyShares(prior, leniency), graded);
  const w = rng.binomial(graded, 0.02 + 0.04 * rng.beta(1, 3));
  return { ...letters, w };
}

/** Instructor-string perturbation (74/12/5/4/3/2 %); forms that do not apply fall back to "Last, First". */
export function drawNameForm(rng: SeededRandom): NameForm {
  const r = rng.float();
  if (r < 0.74) return 'full';
  if (r < 0.86) return 'initial';
  if (r < 0.91) return 'nickname';
  if (r < 0.95) return 'hyphen';
  if (r < 0.98) return 'stripped';
  return 'suffix';
}

export function renderName(name: FullName, form: NameForm): string {
  switch (form) {
    case 'initial': return rawInitial(name);
    case 'nickname': return rawNickname(name) ?? rawFull(name);
    case 'hyphen': return rawHyphenVariant(name) ?? rawFull(name);
    case 'stripped': return rawStripped(name) ?? rawFull(name);
    case 'suffix': return rawSuffix(name);
    default: return rawFull(name);
  }
}

/** The string a professor's row/section carries: forced form > first-row override > random perturbation. */
export function professorRaw(rng: SeededRandom, prof: DemoProfessor, isFirstRow: boolean): string {
  const drawn: NameForm = prof.forcedGradeForm ?? (isFirstRow && prof.firstRowForm ? prof.firstRowForm : drawNameForm(rng));
  // A grades-only (g) instructor has no review record to resolve against, so an initial-only or suffixed variant
  // would split into a second entity at ingest (SPEC 7 step 5 merges on the first token only). Keep the full form.
  const form: NameForm = !prof.reviewed && (drawn === 'initial' || drawn === 'suffix') ? 'full' : drawn;
  return renderName(prof, form);
}

const TERM_WORD: Record<'fa' | 'sp', string> = { fa: 'Fall', sp: 'Spring' };

function row(
  prior: CoursePrior, year: number, season: 'fa' | 'sp', schedType: string, buckets: GradeBuckets, instructorRaw: string,
): RawGradeRow {
  const students = LETTER_KEYS.reduce((n, k) => n + buckets[k], 0) + buckets.w;
  return {
    year, term: TERM_WORD[season], yearTerm: `${year}-${season}`, subject: prior.subject, number: prior.number,
    title: prior.title, schedType, buckets, students, instructorRaw,
  };
}

function gradedSize(rng: SeededRandom, typical: number): number {
  return clamp(Math.round(rng.normal(typical, 0.25 * typical)), 8, 400);
}

export interface GradeRowsResult {
  rows: RawGradeRow[];
  edgeCases: EdgeCaseRecord[];
}

export function generateGradeRows(
  rng: SeededRandom,
  professors: readonly DemoProfessor[],
  taPool: ReadonlyMap<string, FullName[]>,
  courses: readonly CoursePrior[],
  edgeSubject: string,
): GradeRowsResult {
  const rows: RawGradeRow[] = [];
  const edgeCases: EdgeCaseRecord[] = [];
  let strippedRecord: EdgeCaseRecord | null = null;

  for (const prof of professors) {
    if (!prof.hasGrades) continue;
    let first = true;
    for (const course of prof.courses) {
      for (let year = prof.activeYears.start; year <= prof.activeYears.end; year++) {
        const seasons: ('fa' | 'sp')[] = rng.bool(0.25) ? ['sp', 'fa'] : [rng.pick(['sp', 'fa'] as const)];
        for (const season of seasons) {
          const schedType = rng.weightedPick(['LEC', 'LCD', 'ONL'], [70, 20, 10]);
          const graded = gradedSize(rng, course.typicalRowSize);
          const instructorRaw = professorRaw(rng, prof, first);
          if (first && prof.firstRowForm === 'stripped') {
            strippedRecord = edgeCase('d', { professor: prof.sourceId, canonical: rawFull(prof), variant: instructorRaw });
          }
          first = false;
          rows.push(row(course, year, season, schedType, buildBuckets(rng, course, prof.leniency, graded), instructorRaw));
          if (schedType === 'LEC' && rng.bool(0.3)) {
            // 80 % of discussion rows carry the lecturer's own initial-only "Last, F" string (resolves via the
            // `initial` tier and feeds the detail-page TA toggle); the rest name a subject TA. A grades-only (g)
            // instructor keeps the full form so the row merges into the same entity (SPEC 7 step 5 merges on first token).
            const disRaw = rng.bool(0.8)
              ? (prof.reviewed ? rawInitial(prof) : rawFull(prof))
              : rawInitial(rng.pick(taPool.get(prof.subject) ?? []));
            const disGraded = clamp(Math.round(rng.normal(0.3 * course.typicalRowSize, 0.1 * course.typicalRowSize)), 8, 120);
            rows.push(row(course, year, season, 'DIS', buildBuckets(rng, course, prof.leniency, disGraded), disRaw));
          }
        }
      }
    }
  }
  if (strippedRecord) edgeCases.push(strippedRecord);

  // (i) one "Staff" row and one empty-instructor row per subject.
  const subjects = [...new Set(courses.map((c) => c.subject))].sort();
  const currentYear = Math.max(...professors.map((p) => p.activeYears.end));
  for (const subject of subjects) {
    const course = courses.find((c) => c.subject === subject);
    if (!course) continue;
    for (const instructorRaw of ['Staff', '']) {
      const graded = gradedSize(rng, course.typicalRowSize);
      rows.push(row(course, currentYear, 'fa', 'LEC', buildBuckets(rng, course, 0, graded), instructorRaw));
    }
  }
  edgeCases.push(edgeCase('i', { subjects, staffRaw: 'Staff', emptyRaw: '', rowsPerSubject: 2, edgeSubject }));

  rows.sort((x, y) =>
    cmp(x.subject, y.subject) || cmp(x.number, y.number) || x.year - y.year ||
    cmp(x.term, y.term) || cmp(x.schedType, y.schedType) || cmp(x.instructorRaw, y.instructorRaw),
  );
  return { rows, edgeCases };
}

function csvField(value: string, forceQuote = false): string {
  const needs = forceQuote || /[",\n\r]/.test(value);
  return needs ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize rows to the exact upstream CSV shape (23 columns, "\n" line ends, trailing newline). */
export function toGpaCsv(rows: readonly RawGradeRow[]): string {
  const lines = [GPA_CSV_HEADER.join(',')];
  for (const r of rows) {
    const fields = [
      String(r.year), r.term, r.yearTerm, r.subject, r.number, csvField(r.title), r.schedType,
      ...LETTER_KEYS.map((k) => String(r.buckets[k])), String(r.buckets.w), String(r.students),
      r.instructorRaw === '' ? '' : csvField(r.instructorRaw, true),
    ];
    lines.push(fields.join(','));
  }
  return `${lines.join('\n')}\n`;
}
