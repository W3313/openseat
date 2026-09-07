// Registers the University of Houston adapters (MULTI_SCHOOL_DESIGN §2, §7): kind `uh-cougargrades`
// (GradeSource over the cached cougargrades/publicdata records.csv) and `uh-classbrowser` (ScheduleSource
// over the Class Browser JSON API). Options on the registry entry may override the CSV path / API base.
import { registerGradeSource, registerScheduleSource } from '@/lib/sources/registry';
import { UhCougarGradesSource } from './UhCougarGradesSource';
import { UhClassBrowserSource } from './UhClassBrowserSource';

registerGradeSource('uh-cougargrades', (ctx) =>
  new UhCougarGradesSource({
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    csvPath: typeof ctx.options.csvPath === 'string' ? ctx.options.csvPath : undefined,
    log: ctx.log,
  }),
);

registerScheduleSource('uh-classbrowser', (ctx) =>
  new UhClassBrowserSource({
    baseUrl: typeof ctx.options.baseUrl === 'string' ? ctx.options.baseUrl : undefined,
    delayMs: ctx.env.SCHEDULE_FETCH_DELAY_MS,
    refresh: ctx.refresh,
    log: ctx.log,
  }),
);
