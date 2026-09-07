// /about building blocks (SPEC 3.6). Import from "@/components/about".
export { AboutSection, AboutToc, ABOUT_SECTIONS, aboutSectionTitle } from './AboutSection';
export type { AboutSectionId, AboutSectionProps } from './AboutSection';
export { FormulaBlock } from './FormulaBlock';
export type { FormulaBlockProps } from './FormulaBlock';
export { BadgeLegend, BADGE_RULES } from './BadgeLegend';
export type { BadgeLegendProps } from './BadgeLegend';
export { Glossary, glossaryGroups } from './Glossary';
export { MatchTiersTable, MATCH_TIERS } from './MatchTiersTable';
export type { MatchTier } from './MatchTiersTable';
export { CoverageStats, coverageItems, coverageLine, LINKING_METHOD_ORDER } from './CoverageStats';
export type { CoverageStatsProps, CoverageItem } from './CoverageStats';
export { MatchReportTable, filterEntries, REPORT_METHODS } from './MatchReportTable';
export type { MatchReportTableProps, MatchReportFilters, MethodFilter, SourceFilter, ProfessorRef } from './MatchReportTable';
export { ScoringSection } from './ScoringSection';
export type { ScoringSectionProps } from './ScoringSection';
export { AiSection } from './AiSection';
export type { AiSectionProps } from './AiSection';
export { SourcesSection, GPA_DATASET_URL, GPA_DATASET_CSV_URL, COURSE_EXPLORER_URL } from './SourcesSection';
export { SchoolsTable, reviewsCell, datasetCell, BUCKET_LABELS, VALUE_KIND_LABELS } from './SchoolsTable';
export type { SchoolsTableProps, SchoolsTableRow } from './SchoolsTable';
export type { SourcesSectionProps } from './SourcesSection';
export {
  WhatSection, GradesOnlySection, LimitationsSection, PrivacySection, LicensingSection,
} from './StaticSections';
