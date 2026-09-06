// Fictional sections for CURRENT_TERM (SPEC 6.5 "Sections") including edge cases (j) co-taught,
// (k) cross-listed CS 4xx / ECE 4xx, and (l) a course with zero open sections.
import type { Day, Meeting } from '@/lib/domain/types';
import type { RawSection } from '@/lib/sources/types';
import type { SeededRandom } from '@/lib/utils/seededRandom';
import { edgeCase } from './edgeCases';
import type { EdgeCaseRecord } from './edgeCases';
import { drawNameForm, renderName } from './generator-grades';
import type { CoursePrior, DemoProfessor } from './generator-types';
import { cmp } from './generator-types';
import { rawInitial } from './names';
import type { FullName } from './names';

type DemoStatus = 'open' | 'waitlist' | 'closed';

/** 20 fictional buildings — none exist on the UIUC campus. */
export const BUILDINGS: readonly string[] = [
  'Harrow Hall', 'Wrenfield Laboratory', 'Ashcombe Center', 'Tallis Engineering Building', 'Marlowe Sciences Hall',
  'Quillon Auditorium', 'Brackwater Hall', 'Ellery Computing Center', 'Vireo Hall', 'Stonebridge Lecture Hall',
  'Kestrel Physics Building', 'Larkin Mathematics Hall', 'Dunmore Hall', 'Pellham Chemistry Annex', 'Thornbury Hall',
  'Greyfell Learning Commons', 'Halcyon Hall', 'Oberon Technology Center', 'Rookwood Hall', 'Silverthorne Pavilion',
];

const LEC_CODES = ['AL1', 'AL2', 'AL3', 'BL1', 'BL2', 'CL1', 'DL1', 'EL1'] as const;
const ONL_CODES = ['ONL', 'ON1', 'ON2'] as const;
const DIS_CODES = ['ADA', 'ADB', 'ADC', 'ADD', 'BDA', 'BDB', 'CDA'] as const;

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function room(rng: SeededRandom): Pick<Meeting, 'building' | 'room'> {
  return { building: rng.pick(BUILDINGS), room: String(rng.int(100, 499)) };
}

/** Slot table: MWF 50 min 08:00–16:00 (50 %), TR 80 min 08:00–17:00 (40 %), one evening slot (10 %). */
export function drawMeeting(rng: SeededRandom, type: string, arrangedP = 0.1): Meeting {
  if (type === 'ONL' || rng.bool(arrangedP)) return { days: [], start: null, end: null, building: null, room: null, type };
  const kind = rng.weightedPick(['MWF', 'TR', 'EVE'] as const, [50, 40, 10]);
  let days: Day[];
  let start: string;
  let end: string;
  if (kind === 'MWF') {
    const h = rng.int(8, 16);
    days = ['M', 'W', 'F']; start = hhmm(h, 0); end = hhmm(h, 50);
  } else if (kind === 'TR') {
    const startMin = 8 * 60 + rng.int(0, 5) * 90;                     // 08:00 … 15:30
    days = ['T', 'R']; start = hhmm(Math.floor(startMin / 60), startMin % 60);
    const endMin = startMin + 80; end = hhmm(Math.floor(endMin / 60), endMin % 60);
  } else {
    days = ['M', 'W']; start = '18:00'; end = '19:20';
  }
  return { days, start, end, ...room(rng), type };
}

export function drawCrn(rng: SeededRandom, used: Set<string>): string {
  for (;;) {
    const crn = String(rng.int(30000, 79999));
    if (!used.has(crn)) { used.add(crn); return crn; }
  }
}

/** Schedule strings: 25 % "Last, F" for realism, otherwise the same perturbation as grade rows. */
function scheduleRaw(rng: SeededRandom, prof: DemoProfessor): string {
  if (prof.forcedGradeForm) return renderName(prof, prof.forcedGradeForm);
  return rng.bool(0.25) ? rawInitial(prof) : renderName(prof, drawNameForm(rng));
}

export interface SectionsResult {
  sections: RawSection[];
  edgeCases: EdgeCaseRecord[];
}

export function generateSections(
  rng: SeededRandom,
  professors: readonly DemoProfessor[],
  taPool: ReadonlyMap<string, FullName[]>,
  courses: readonly CoursePrior[],
  edgeSubject: string,
): SectionsResult {
  const sections: RawSection[] = [];
  const edgeCases: EdgeCaseRecord[] = [];
  const usedCrn = new Set<string>();

  // (l) course with zero open sections: the edge subject's least-graded course.
  const edgeCourses = courses.filter((c) => c.subject === edgeSubject);
  const noOpenCourse = [...edgeCourses].sort((x, y) => x.graded - y.graded || cmp(x.courseId, y.courseId))[0];
  // (k) cross-listed pair: highest-numbered edge-subject course (≠ noOpenCourse) and highest-numbered ECE course.
  const highest = (list: CoursePrior[]): CoursePrior | undefined =>
    [...list].sort((x, y) => cmp(y.number, x.number) || cmp(x.courseId, y.courseId))[0];
  const crossA = highest(edgeCourses.filter((c) => c !== noOpenCourse));
  const otherSubject = edgeSubject === 'ECE' ? 'CS' : 'ECE';
  const crossB = highest(courses.filter((c) => c.subject === otherSubject));

  const emit = (course: CoursePrior, type: string, status: DemoStatus, instructorsRaw: string[], meeting?: Meeting, crn?: string, code?: string): RawSection => {
    const finalStatus: DemoStatus = course === noOpenCourse && status === 'open' ? 'closed' : status;
    const codes = type === 'ONL' ? ONL_CODES : type === 'DIS' ? DIS_CODES : LEC_CODES;
    const section: RawSection = {
      crn: crn ?? drawCrn(rng, usedCrn), subject: course.subject, number: course.number,
      sectionCode: code ?? rng.pick(codes), statusCode: finalStatus, seatsKnown: true,
      instructorsRaw, meetings: [meeting ?? drawMeeting(rng, type)],
    };
    sections.push(section);
    return section;
  };

  const emitWithDiscussion = (course: CoursePrior, prof: DemoProfessor, status: DemoStatus): RawSection => {
    const type = rng.weightedPick(['LEC', 'LCD', 'ONL'], [70, 20, 10]);
    const lecture = emit(course, type, status, [scheduleRaw(rng, prof)]);
    if (type !== 'ONL' && rng.bool(0.3)) {
      const disRaw = rng.bool(0.8) ? rawInitial(prof) : rawInitial(rng.pick(taPool.get(course.subject) ?? []));
      emit(course, 'DIS', status, [disRaw], drawMeeting(rng, 'DIS', 0));
    }
    return lecture;
  };

  for (const prof of professors) {
    if (prof.courses.length === 0) continue;
    let status: DemoStatus | null;
    let count: number;
    const r = rng.float();
    if (r < 0.4) { status = 'open'; count = rng.int(1, 3); }
    else if (r < 0.65) { status = 'closed'; count = rng.int(1, 2); }
    else if (r < 0.73) { status = 'waitlist'; count = 1; }
    else { status = null; count = 0; }
    if (prof.forcedSectionStatus === 'open') { status = 'open'; count = Math.max(1, count); }
    for (let i = 0; i < count && status; i++) {
      const course = rng.pick(prof.courses.filter((c) => c !== noOpenCourse || prof.courses.length === 1));
      emitWithDiscussion(course, prof, status);
    }
  }

  const edgeProfs = professors.filter((p) => p.subject === edgeSubject && p.reviewed);

  // (j) co-taught: professors 9 and 10 of the edge subject share one LEC.
  const [coA, coB] = [edgeProfs[9], edgeProfs[10]];
  const coCourse = coA.courses.find((c) => c !== noOpenCourse) ?? coA.courses[0];
  const coTaught = emit(coCourse, 'LEC', 'open', [scheduleRaw(rng, coA), scheduleRaw(rng, coB)]);
  edgeCases.push(edgeCase('j', { crn: coTaught.crn, courseId: coCourse.courseId, professors: [coA.sourceId, coB.sourceId], instructorsRaw: coTaught.instructorsRaw }));

  // (k) cross-listed: same CRN, meeting and instructor under two course ids.
  if (crossA && crossB) {
    const owner = professors.find((p) => p.subject === edgeSubject && p.courses.includes(crossA)) ?? edgeProfs[0];
    const meeting = drawMeeting(rng, 'LEC', 0);
    const raw = [scheduleRaw(rng, owner)];
    const first = emit(crossA, 'LEC', 'open', raw, meeting, undefined, 'AL1');
    emit(crossB, 'LEC', 'open', raw, meeting, first.crn, 'AL1');
    edgeCases.push(edgeCase('k', { crn: first.crn, courseIds: [crossA.courseId, crossB.courseId], professor: owner.sourceId }));
  }

  // (l) make sure the zero-open course has at least one (closed) section.
  if (!sections.some((s) => s.subject === noOpenCourse.subject && s.number === noOpenCourse.number)) {
    const owner = professors.find((p) => p.courses.includes(noOpenCourse)) ?? edgeProfs[0];
    emit(noOpenCourse, 'LEC', 'closed', [scheduleRaw(rng, owner)]);
  }
  const noOpenCount = sections.filter((s) => s.subject === noOpenCourse.subject && s.number === noOpenCourse.number).length;
  edgeCases.push(edgeCase('l', { courseId: noOpenCourse.courseId, sections: noOpenCount, openSections: 0 }));

  sections.sort((x, y) => cmp(x.crn, y.crn) || cmp(x.subject, y.subject) || cmp(x.number, y.number));
  return { sections, edgeCases };
}
