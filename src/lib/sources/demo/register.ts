// Registers the fictional adapters (kinds demo-grades / demo-schedule / demo-reviews) used by the `demo`
// school. Options come from env (DEMO_SEED, GRADE_YEARS_BACK) and the school's registry entry.
import path from 'node:path';
import { registerGradeSource, registerReviewSource, registerScheduleSource } from '@/lib/sources/registry';
import { schoolConfigDir } from '@/lib/config/schools';
import { loadDepartments, type DepartmentMap } from '@/lib/sources/uiuc/departments';
import { DemoGradeSource } from './DemoGradeSource';
import { DemoScheduleSource } from './DemoScheduleSource';
import { DemoReviewSource } from './DemoReviewSource';

function departmentsFor(configDir: string): DepartmentMap | undefined {
  try {
    return loadDepartments('demo', path.join(process.cwd(), configDir, 'departments.json'));
  } catch {
    return undefined;
  }
}

registerGradeSource('demo-grades', (ctx) =>
  new DemoGradeSource({
    seed: ctx.env.DEMO_SEED,
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    dir: typeof ctx.options.dir === 'string' ? ctx.options.dir : undefined,
    log: ctx.log,
  }),
);

registerScheduleSource('demo-schedule', (ctx) =>
  new DemoScheduleSource({ seed: ctx.env.DEMO_SEED, dir: typeof ctx.options.dir === 'string' ? ctx.options.dir : undefined }),
);

registerReviewSource('demo-reviews', (ctx) =>
  new DemoReviewSource({
    seed: ctx.env.DEMO_SEED,
    dir: typeof ctx.options.dir === 'string' ? ctx.options.dir : undefined,
    departments: departmentsFor(schoolConfigDir(ctx.config)),
    log: ctx.log,
  }),
);
