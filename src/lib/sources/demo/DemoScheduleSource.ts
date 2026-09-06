// ScheduleSource over data/raw/demo/{school}/sections.json (RawSection[] written by seed-demo.ts).
// Demo sections DO carry seat status (open | waitlist | closed) so the "open sections" filter is fully
// demonstrable; fetchedAt is the fixed snapshot stamp from SPEC 6.5 so the demo stays deterministic.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { SchoolId, TermCode } from '@/lib/domain/types';
import type { RawSection, ScheduleSource, SourceInfo } from '@/lib/sources/types';
import { isTermCode } from '@/lib/utils/term';
import { demoRawDir, demoSourceLabel } from './DemoGradeSource';

/** Fixed snapshot time for demo sections (SPEC 6.5). */
export const DEMO_FETCHED_AT = '2026-09-03T14:12:00Z';
export const DEMO_STATUS_CODES = ['open', 'waitlist', 'closed'] as const;

const DaySchema = z.enum(['M', 'T', 'W', 'R', 'F', 'S', 'U']);
const MeetingSchema = z.object({
  days: z.array(DaySchema).default([]),
  start: z.string().nullable().default(null),
  end: z.string().nullable().default(null),
  building: z.string().nullable().default(null),
  room: z.string().nullable().default(null),
  type: z.string().default('LEC'),
});
export const DemoRawSectionSchema = z.object({
  crn: z.string().min(1),
  subject: z.string().min(1).transform((s) => s.toUpperCase()),
  number: z.string().min(1).transform((s) => s.toUpperCase()),
  sectionCode: z.string().default(''),
  statusCode: z.enum(DEMO_STATUS_CODES),
  seatsKnown: z.boolean().optional().transform(() => true),
  instructorsRaw: z.array(z.string()).default([]),
  meetings: z.array(MeetingSchema).default([]),
});

/** sections.json is either a bare RawSection[] or `{ term, fetchedAt, sections }`. */
const SectionsFileSchema = z.union([
  z.array(DemoRawSectionSchema).transform((sections) => ({ term: null, fetchedAt: null, sections })),
  z.object({
    term: z.string().nullable().optional().transform((v) => v ?? null),
    fetchedAt: z.string().nullable().optional().transform((v) => v ?? null),
    sections: z.array(DemoRawSectionSchema),
  }),
]);

export interface DemoScheduleSourceOptions {
  seed: number;
  dir?: string;
}

export class DemoScheduleSource implements ScheduleSource {
  readonly info: SourceInfo;
  private readonly dir?: string;
  private cache = new Map<string, Promise<z.infer<typeof SectionsFileSchema>>>();

  constructor(opts: DemoScheduleSourceOptions) {
    this.info = { id: 'demo-schedule', label: demoSourceLabel(opts.seed), url: null, license: 'MIT' };
    this.dir = opts.dir;
  }

  sectionsPath(schoolId: SchoolId): string {
    return path.join(demoRawDir(schoolId, this.dir), 'sections.json');
  }

  private load(schoolId: SchoolId) {
    let p = this.cache.get(schoolId);
    if (!p) {
      p = (async () => {
        const file = this.sectionsPath(schoolId);
        let text: string;
        try {
          text = await readFile(file, 'utf8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Demo sections not found at ${file}. Run \`npm run data:seed\` first.`);
          }
          throw err;
        }
        return SectionsFileSchema.parse(JSON.parse(text));
      })();
      this.cache.set(schoolId, p);
    }
    return p;
  }

  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{
    term: TermCode; fetchedAt: string; sections: RawSection[];
  }> {
    const file = await this.load(opts.schoolId);
    const subject = opts.subject.toUpperCase();
    const sections: RawSection[] = file.sections
      .filter((s) => s.subject === subject)
      .map((s) => ({ ...s, seatsKnown: true, instructorsRaw: dedupeTrimmed(s.instructorsRaw) }));
    const term = file.term && isTermCode(file.term) ? file.term : opts.term;
    return { term, fetchedAt: file.fetchedAt ?? DEMO_FETCHED_AT, sections };
  }
}

function dedupeTrimmed(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    if (t !== '' && !out.includes(t)) out.push(t);
  }
  return out;
}
