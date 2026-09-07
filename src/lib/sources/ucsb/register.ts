// Registers the UCSB adapters (MULTI_SCHOOL_DESIGN §2, §7): kind `ucsb-daily-nexus-csv` (GradeSource over
// the cached Daily Nexus CSV) and `ucsb-curriculums` (ScheduleSource over the Curriculums API, a no-op
// without env UCSB_API_KEY). Registry options: grades `{ csvPath }`; schedule `{ baseUrl, seats }`.
import { registerGradeSource, registerScheduleSource } from '@/lib/sources/registry';
import { UcsbGradesSource } from './UcsbGradesSource';
import { UcsbCurriculumsSource } from './UcsbCurriculumsSource';

registerGradeSource('ucsb-daily-nexus-csv', (ctx) =>
  new UcsbGradesSource({
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    csvPath: typeof ctx.options.csvPath === 'string' ? ctx.options.csvPath : undefined,
    log: ctx.log,
  }),
);

registerScheduleSource('ucsb-curriculums', (ctx) =>
  new UcsbCurriculumsSource({
    apiKey: ctx.env.UCSB_API_KEY,
    baseUrl: typeof ctx.options.baseUrl === 'string' ? ctx.options.baseUrl : undefined,
    seats: ctx.options.seats === true,
    concurrency: Math.min(2, ctx.env.SCHEDULE_FETCH_CONCURRENCY),
    delayMs: Math.max(250, ctx.env.SCHEDULE_FETCH_DELAY_MS),
    refresh: ctx.refresh,
    log: ctx.log,
  }),
);
