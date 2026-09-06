// Professor planning for the demo seed (SPEC 6.5): fictional names with the real-instructor collision
// guard, latent traits, course assignment (every course ends with 2–4 grade-bearing instructors), active
// years, plus the person-level edge cases (a)–(h) which are all planted in CS.
import type { VibeTag } from '@/lib/domain/types';
import { POSITIVE_VIBE_TAGS } from '@/lib/domain/types';
import { instructorKey, lettersOnlyKey } from '@/lib/utils/hash';
import { clamp } from '@/lib/utils/seededRandom';
import type { SeededRandom } from '@/lib/utils/seededRandom';
import { termYear } from '@/lib/utils/term';
import type { CoursePrior, DemoProfessor, SeedOptions } from './generator-types';
import { PROFESSORS_PER_SUBJECT, VIBE_TAG_LIST, cmp } from './generator-types';
import { edgeCase } from './edgeCases';
import type { EdgeCaseRecord } from './edgeCases';
import { FIRST_NAMES, SURNAMES, surnamesOfShape } from './names';
import type { FullName, Surname } from './names';

export interface ProfessorPlan {
  professors: DemoProfessor[];
  /** Per subject: 2 TA names used for DIS rows/sections as "Last, F". */
  taPool: Map<string, FullName[]>;
  edgeCases: EdgeCaseRecord[];
  /** Sorted subject that carries the CS-style edge cases ('CS' when present). */
  edgeSubject: string;
}

class NameDrawer {
  private readonly usedSurnames = new Set<string>();
  private readonly usedPairs = new Set<string>();
  constructor(private readonly rng: SeededRandom, private readonly opts: SeedOptions) {}

  /** True when (first, last) would collide with a real instructor key or a blocked surname. */
  private blocked(first: string, last: string): boolean {
    return this.opts.realInstructorKeys.has(instructorKey(last, first)) || this.opts.blockedSurnames.has(lettersOnlyKey(last));
  }

  private pairKey(first: string, last: string): string {
    return `${lettersOnlyKey(last)}|${lettersOnlyKey(first)}`;
  }

  /** Fresh surname (globally unique) + first name; optional shape filter and first-name predicate. */
  draw(shape?: Surname['shape'], firstOk: (f: string) => boolean = () => true): FullName {
    const pool = shape ? surnamesOfShape(shape) : SURNAMES;
    for (let attempt = 0; attempt < 5000; attempt++) {
      const last = this.rng.pick(pool).name;
      const first = this.rng.pick(FIRST_NAMES);
      if (this.usedSurnames.has(lettersOnlyKey(last)) || !firstOk(first) || this.blocked(first, last)) continue;
      this.commit(first, last);
      return { firstName: first, lastName: last };
    }
    throw new Error('NameDrawer: could not find a non-colliding fictional name');
  }

  /** Reuse an existing surname with a new first name satisfying `firstOk` (edge cases (a) and (b)). */
  drawWithSurname(last: string, firstOk: (f: string) => boolean): FullName {
    for (let attempt = 0; attempt < 5000; attempt++) {
      const first = this.rng.pick(FIRST_NAMES);
      if (!firstOk(first) || this.usedPairs.has(this.pairKey(first, last)) || this.blocked(first, last)) continue;
      this.commit(first, last);
      return { firstName: first, lastName: last };
    }
    throw new Error(`NameDrawer: no first name available for surname ${last}`);
  }

  /** A specific first name with a fresh surname (edge case (e): Robert). */
  drawWithFirst(first: string): FullName {
    for (let attempt = 0; attempt < 5000; attempt++) {
      const last = this.rng.pick(SURNAMES).name;
      if (this.usedSurnames.has(lettersOnlyKey(last)) || this.blocked(first, last)) continue;
      this.commit(first, last);
      return { firstName: first, lastName: last };
    }
    throw new Error(`NameDrawer: no surname available for first name ${first}`);
  }

  /** TA names: surnames never used by a professor; reuse across subjects is fine (matching is subject-scoped). */
  drawTa(): FullName {
    for (let attempt = 0; attempt < 5000; attempt++) {
      const last = this.rng.pick(SURNAMES).name;
      const first = this.rng.pick(FIRST_NAMES);
      if (this.usedSurnames.has(lettersOnlyKey(last)) || this.blocked(first, last)) continue;
      return { firstName: first, lastName: last };
    }
    throw new Error('NameDrawer: no TA name available');
  }

  private commit(first: string, last: string): void {
    this.usedSurnames.add(lettersOnlyKey(last));
    this.usedPairs.add(this.pairKey(first, last));
  }
}

function drawStyleTags(rng: SeededRandom, quality: number): VibeTag[] {
  const count = rng.int(2, 4);
  const wPos = quality > 3.5 ? 3 : 1;
  const wNeg = quality > 3.5 ? 1 : 3;
  const remaining = [...VIBE_TAG_LIST];
  const out: VibeTag[] = [];
  while (out.length < count && remaining.length > 0) {
    const weights = remaining.map((t) => (POSITIVE_VIBE_TAGS.has(t) ? wPos : wNeg));
    const tag = rng.weightedPick(remaining, weights);
    out.push(tag);
    remaining.splice(remaining.indexOf(tag), 1);
  }
  return out.sort();
}

function drawTraits(rng: SeededRandom): Pick<DemoProfessor, 'quality' | 'leniency' | 'difficulty' | 'styleTags'> {
  const quality = 1 + 4 * rng.beta(5, 2);
  const leniency = clamp(rng.normal(0, 0.28), -0.6, 0.6);
  const difficulty = clamp(3 - 1.5 * leniency + rng.normal(0, 0.5), 1, 5);
  return { quality, leniency, difficulty, styleTags: drawStyleTags(rng, quality) };
}

function drawActiveYears(rng: SeededRandom, currentYear: number): { start: number; end: number } {
  const lo = currentYear - 6;
  const hi = currentYear - 1;
  const length = rng.int(3, Math.min(7, hi - lo + 1));
  const start = rng.int(lo, hi - length + 1);
  return { start, end: start + length - 1 };
}

/** 1–3 courses each, then top up so every course has ≥ 2 grade-bearing instructors (cap 4 per course). */
function assignCourses(rng: SeededRandom, profs: DemoProfessor[], courses: readonly CoursePrior[]): void {
  for (const p of profs) {
    const n = p.reviewed ? rng.weightedPick([1, 2, 3], [1, 3, 6]) : rng.int(1, 2);
    p.courses = rng.shuffle(courses).slice(0, n);
  }
  const graders = profs.filter((p) => p.hasGrades);
  const countFor = (c: CoursePrior): number => graders.filter((p) => p.courses.includes(c)).length;
  for (const course of courses) {
    while (countFor(course) > 3) {
      const donor = graders
        .filter((p) => p.courses.includes(course) && p.courses.length > 1)
        .sort((x, y) => y.courses.length - x.courses.length || x.index - y.index)[0];
      if (!donor) break;
      donor.courses = donor.courses.filter((c) => c !== course);
    }
    while (countFor(course) < 1) {
      const taker = graders
        .filter((p) => !p.courses.includes(course))
        .sort((x, y) => x.courses.length - y.courses.length || x.index - y.index)[0];
      if (!taker) break;
      taker.courses = [...taker.courses, course];
    }
  }
  for (const p of profs) p.courses = [...p.courses].sort((x, y) => cmp(x.courseId, y.courseId));
}

export function planProfessors(rng: SeededRandom, opts: SeedOptions, courses: readonly CoursePrior[]): ProfessorPlan {
  const subjects = [...opts.subjects].sort();
  const edgeSubject = subjects.includes('CS') ? 'CS' : subjects[0];
  const currentYear = termYear(opts.currentTerm);
  const drawer = new NameDrawer(rng, opts);
  const professors: DemoProfessor[] = [];
  const edgeCases: EdgeCaseRecord[] = [];
  const gradesOnlyNames: string[] = [];
  const gradesOnlySubjects: string[] = [];
  let reviewedSeq = 0;
  let gradesOnlySeq = 0;

  for (const subject of subjects) {
    const subjectCourses = courses.filter((c) => c.subject === subject);
    const department = opts.departments[subject]?.[0] ?? subject;
    const isEdge = subject === edgeSubject;
    const subjectProfs: DemoProfessor[] = [];

    const make = (name: FullName, reviewed: boolean): DemoProfessor => {
      const sourceId = reviewed ? `demo-p-${String(++reviewedSeq).padStart(3, '0')}` : `demo-g-${String(++gradesOnlySeq).padStart(3, '0')}`;
      const prof: DemoProfessor = {
        sourceId, index: professors.length, firstName: name.firstName, lastName: name.lastName, subject, department,
        reviewed, hasGrades: true, forcedGradeForm: null, firstRowForm: null,
        ...drawTraits(rng), courses: [], activeYears: drawActiveYears(rng, currentYear),
        reviewCountOverride: null, forcedSectionStatus: null,
      };
      professors.push(prof);
      subjectProfs.push(prof);
      return prof;
    };

    for (let i = 0; i < PROFESSORS_PER_SUBJECT; i++) {
      if (!isEdge) { make(drawer.draw(), true); continue; }
      switch (i) {
        case 0: make(drawer.draw('plain'), true); break;
        case 1: { // (a) same surname, different first name AND initial
          const p0 = subjectProfs[0];
          make(drawer.drawWithSurname(p0.lastName, (f) => f.charAt(0) !== p0.firstName.charAt(0)), true);
          break;
        }
        case 2: make(drawer.draw('plain'), true); break;
        case 3: { // (b) same surname and initial; rows only ever "Last, F"
          const p2 = subjectProfs[2];
          const p3 = make(drawer.drawWithSurname(p2.lastName, (f) => f.charAt(0) === p2.firstName.charAt(0) && f !== p2.firstName), true);
          p3.forcedGradeForm = 'initial';
          break;
        }
        case 4: make(drawer.draw('hyphenated'), true).firstRowForm = 'hyphen'; break;   // (c)
        case 5: make(drawer.draw('diacritic'), true).firstRowForm = 'stripped'; break;   // (d)
        case 6: make(drawer.drawWithFirst('Robert'), true).firstRowForm = 'nickname'; break; // (e)
        case 7: make(drawer.draw(), true).firstRowForm = 'suffix'; break;                // (f)
        case 8: { // (h) reviews, sections, no grade rows
          const p8 = make(drawer.draw(), true);
          p8.hasGrades = false;
          p8.reviewCountOverride = rng.int(5, 12);
          p8.forcedSectionStatus = 'open';
          break;
        }
        default: make(drawer.draw(), true);
      }
    }
    if (subject !== 'CHEM') { // (g) grades-only instructor with no review record
      const g = make(drawer.draw(), false);
      gradesOnlyNames.push(`${g.lastName}, ${g.firstName}`);
      gradesOnlySubjects.push(subject);
    }
    assignCourses(rng, subjectProfs, subjectCourses);
  }

  const taPool = new Map<string, FullName[]>();
  for (const subject of subjects) {
    const tas: FullName[] = [];
    while (tas.length < 2) {
      const ta = drawer.drawTa();
      if (!tas.some((t) => t.lastName === ta.lastName)) tas.push(ta);
    }
    taPool.set(subject, tas);
  }

  const cs = professors.filter((p) => p.subject === edgeSubject && p.reviewed);
  const full = (p: DemoProfessor): string => `${p.lastName}, ${p.firstName}`;
  edgeCases.push(
    edgeCase('a', { subject: edgeSubject, surname: cs[0].lastName, professors: [cs[0].sourceId, cs[1].sourceId], names: [full(cs[0]), full(cs[1])] }),
    edgeCase('b', { subject: edgeSubject, surname: cs[2].lastName, initial: cs[2].firstName.charAt(0), professors: [cs[2].sourceId, cs[3].sourceId], names: [full(cs[2]), full(cs[3])], initialOnlyProfessor: cs[3].sourceId, ambiguousRaw: `${cs[3].lastName}, ${cs[3].firstName.charAt(0)}` }),
    edgeCase('c', { professor: cs[4].sourceId, canonical: full(cs[4]), variant: `${cs[4].lastName.replace(/-/g, ' ')}, ${cs[4].firstName}` }),
    edgeCase('e', { professor: cs[6].sourceId, canonical: full(cs[6]), variant: `${cs[6].lastName}, Bob` }),
    edgeCase('f', { professor: cs[7].sourceId, canonical: full(cs[7]), variant: `${cs[7].lastName}, ${cs[7].firstName} Jr` }),
    edgeCase('g', { instructors: gradesOnlyNames, subjects: gradesOnlySubjects }),
    edgeCase('h', { professor: cs[8].sourceId, name: full(cs[8]) }),
  );
  // (d) needs the stripped variant; computed by the grade generator, which owns the stripping helper —
  // recorded there. Order of edgeCases is fixed by id in generator.ts.
  return { professors, taPool, edgeCases, edgeSubject };
}
