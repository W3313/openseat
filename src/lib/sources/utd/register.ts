// Registers the UT Dallas adapter: kind `utd-grades-csv` (GradeSource over the cached acmutd/utd-grades
// term CSVs). UTD has no verified schedule source and no reviews, so this is the school's only adapter.
// Options from the registry entry may override the raw directory (`dir`).
import { registerGradeSource } from '@/lib/sources/registry';
import { UtdGradesCsvSource } from './UtdGradesCsvSource';

registerGradeSource('utd-grades-csv', (ctx) =>
  new UtdGradesCsvSource({
    currentTerm: ctx.config.currentTerm,
    yearsBack: ctx.env.GRADE_YEARS_BACK,
    dir: typeof ctx.options.dir === 'string' ? ctx.options.dir : undefined,
    log: ctx.log,
  }),
);
