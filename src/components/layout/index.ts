// Site chrome (SPEC 10: src/components/layout). Import from "@/components/layout".
export { SiteHeader, GITHUB_URL } from "./SiteHeader";
export type { SiteHeaderProps } from "./SiteHeader";
export { SiteFooter } from "./SiteFooter";
export type { SiteFooterProps } from "./SiteFooter";
export { DataBadge, dataBadgeText } from "./DataBadge";
export type { DataBadgeProps } from "./DataBadge";
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbProps, BreadcrumbItem } from "./Breadcrumb";
export { DataProvenance, formatStamp, formatCounts, reviewsClause } from "./DataProvenance";
export type { DataProvenanceProps } from "./DataProvenance";
export { resolveSchoolFlags, isGradesOnly } from "./schoolFlags";
export type { SchoolFlags, SchoolLike, SchoolAttribution, GradeValueKind, GradeBucketKind } from "./schoolFlags";
export { schoolFromPathname, pickBySchool } from "./schoolFromPath";
export { buildSchoolChrome, fallbackChrome } from "./schoolChrome";
export type { SchoolChrome, SchoolSourceUrls } from "./schoolChrome";
export { SchoolChromeBadge, SchoolProvenance, useSchoolChrome } from "./SchoolChromeSwitch";
export type { SchoolChromeSwitchProps } from "./SchoolChromeSwitch";
