// Registers the UIUC adapters: kind `uiuc-gpa-csv` (GradeSource over the cached public GPA CSV) and
// `uiuc-course-explorer` (ScheduleSource over the Course Explorer XML API). Options may override the CSV
// path / API base from the registry entry; env supplies the polite-fetch knobs.
import { registerGradeSource, registerScheduleSource } from '@/lib/sources/registry';
import { UiucGpaCsvSource } from './UiucGpaCsvSource';
import { CourseExplorerSource } from './CourseExplorerSource';

registerGradeSource('uiuc-gpa-csv', (ctx) =>
  new UiucGpaCsvSource({
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    csvPath: typeof ctx.options.csvPath === 'string' ? ctx.options.csvPath : undefined,
    log: ctx.log,
  }),
);

registerScheduleSource('uiuc-course-explorer', (ctx) =>
  new CourseExplorerSource({
    baseUrl: typeof ctx.options.baseUrl === 'string' ? ctx.options.baseUrl : ctx.env.UIUC_COURSE_EXPLORER_BASE,
    concurrency: ctx.env.SCHEDULE_FETCH_CONCURRENCY,
    delayMs: ctx.env.SCHEDULE_FETCH_DELAY_MS,
    refresh: ctx.refresh,
    log: ctx.log,
  }),
);
