// Landing page components (SPEC 3.1). Import from "@/components/landing".
export { HeroForm, rankingsHref, heroTagline, LAST_SCHOOL_KEY } from "./HeroForm";
export type { HeroFormProps } from "./HeroForm";
export { SchoolSelect, schoolOptionLabel, schoolHint } from "./SchoolSelect";
export type { SchoolSelectProps, SchoolOption } from "./SchoolSelect";
export { SubjectCombobox, subjectOptionText, resolveSubjectText } from "./SubjectCombobox";
export type { SubjectComboboxProps, SubjectOption } from "./SubjectCombobox";
export { CourseNumberInput, sanitizeCourseNumber, isCompleteCourseNumber } from "./CourseNumberInput";
export type { CourseNumberInputProps } from "./CourseNumberInput";
export { PopularSubjectChips, pickPopularSubjects } from "./PopularSubjectChips";
export type { PopularSubjectChipsProps } from "./PopularSubjectChips";
export { StatsStrip, statsItems, statsText, sumCounts } from "./StatsStrip";
export type { StatsStripProps, StatItem } from "./StatsStrip";
export { HowItWorks, HOW_IT_WORKS_TILES } from "./HowItWorks";
export type { HowItWorksProps, HowItWorksTile } from "./HowItWorks";
