--- key definition used: sha256(lastCompact + '|' + firstToken).slice(0,12) where lastCompact = NFKD-stripped, lowercase, letters-only last name; firstToken = same normalization of the first whitespace token of the first-name part
Generated 2026-09-04 by a reference script from the public UIUC GPA dataset; scripts/fetch-uiuc-gpa.ts must reproduce these files. No real instructor name is stored here.

course-priors.json is filtered to the SUBJECTS list (CS, ECE, MATH, PHYS, STAT, CHEM) to keep the repo small; scripts/fetch-uiuc-gpa.ts takes --subjects (default: env SUBJECTS) and must reproduce this file for those subjects. Only courses with >= 200 graded students over all years are included.
