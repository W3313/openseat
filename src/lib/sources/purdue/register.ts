// Registers the Purdue adapters: kind `purdue-boiler-grades` (GradeSource over the cached boiler-grades
// term CSVs, percent-only) and `purdue-io` (ScheduleSource over the purdue.io OData API, no seats).
// Registry options may override the grades dir / API base; env supplies the window and fetch delay.
import { registerGradeSource, registerScheduleSource } from '@/lib/sources/registry';
import { PurdueBoilerGradesSource } from './PurdueBoilerGradesSource';
import { PurdueIoSource } from './PurdueIoSource';

registerGradeSource('purdue-boiler-grades', (ctx) =>
  new PurdueBoilerGradesSource({
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    dir: typeof ctx.options.dir === 'string' ? ctx.options.dir : undefined,
    log: ctx.log,
  }),
);

registerScheduleSource('purdue-io', (ctx) =>
  new PurdueIoSource({
    baseUrl: typeof ctx.options.baseUrl === 'string' ? ctx.options.baseUrl : undefined,
    delayMs: Math.max(250, ctx.env.SCHEDULE_FETCH_DELAY_MS),
    refresh: ctx.refresh,
    log: ctx.log,
  }),
);
