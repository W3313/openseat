// Generated list of adapter registrations (MULTI_SCHOOL_DESIGN §2, §7). Every school directory under
// src/lib/sources/ contributes a `register.ts` that calls registerGradeSource / registerScheduleSource /
// registerReviewSource from '@/lib/sources/registry'. Side-effect imports only — keep one line per school,
// alphabetical. Add a line here (and the SchoolConfig to src/lib/config/schools/index.ts) for a new school.
import './purdue/register';
import './rmp/register';
import './uh/register';
import './uiuc/register';
