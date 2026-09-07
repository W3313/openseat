import { ImageResponse } from "next/og";
import type { GradeBuckets, GradeValueKind, RankedProfessor } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { normalizeSubjectCode, DEFAULT_RANKINGS_QUERY } from "@/lib/utils/urlState";
import { applyRankingsQuery, effectiveQuery } from "@/lib/scoring/rank";
import { termDisplay } from "@/lib/utils/term";
import { gradedCountText } from "@/lib/copy/tooltips";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";

type Params = { school: string; subject: string };

export const alt = "ProfPeek — top professors in this subject";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<Params[]> {
  const repo = getRepository();
  const out: Params[] = [];
  for (const school of SCHOOL_IDS) {
    const subjects = await repo.getSubjects(school).catch(() => []);
    for (const s of subjects) out.push({ school, subject: s.code });
  }
  return out;
}

/** Okabe–Ito grade palette (SPEC 3.0), A+/A/A−/B/C/D/F/W. */
const SEGMENTS: { keys: (keyof GradeBuckets)[]; color: string }[] = [
  { keys: ["aPlus"], color: "#004c8c" },
  { keys: ["a"], color: "#0072b2" },
  { keys: ["aMinus"], color: "#56b4e9" },
  { keys: ["bPlus", "b", "bMinus"], color: "#009e73" },
  { keys: ["cPlus", "c", "cMinus"], color: "#f0e442" },
  { keys: ["dPlus", "d", "dMinus"], color: "#e69f00" },
  { keys: ["f"], color: "#d55e00" },
  { keys: ["w"], color: "#8c8c8c" },
];

const INK = "#111827";
const MUTED = "#4b5563";
const BRAND = "#2f4fd1";
const FOOTER_MAX_CHARS = 110;

/** Cut at a word boundary and append an ellipsis instead of slicing mid-word (pure; exported for tests). */
export function truncateWords(text: string, max = FOOTER_MAX_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:·—-]+$/, "")}…`;
}

/**
 * Footer of a grades-only card: "Official grade data · UIUC · UIUC GPA dataset (wadefagen/datasets)". The
 * short source label (meta.sources) replaces the registry's sentence-long attribution; when no meta is
 * available the attribution is truncated at a word boundary.
 */
export function gradesFooter(shortName: string, sourceLabel: string | null, attribution: string): string {
  const base = `Official grade data · ${shortName}`;
  if (sourceLabel) return truncateWords(`${base} · ${sourceLabel}`);
  return truncateWords(`${base} · ${attribution}`);
}

/** 600×24 mini grade bar as flex divs (no SVG in ImageResponse). */
function MiniBar({ buckets }: { buckets: GradeBuckets }) {
  const total = Object.values(buckets).reduce((s, n) => s + n, 0);
  return (
    <div style={{ display: "flex", width: 600, height: 24, borderRadius: 6, overflow: "hidden", background: "#e5e7eb" }}>
      {total > 0
        ? SEGMENTS.map((seg) => {
            const count = seg.keys.reduce((s, k) => s + buckets[k], 0);
            if (count === 0) return null;
            return <div key={seg.color} style={{ width: `${(count / total) * 100}%`, height: "100%", background: seg.color }} />;
          })
        : null}
    </div>
  );
}

/** "GPA 3.34 · +0.66 vs course · 653 students graded" — or "· 7 sections graded" for percent-only schools (design §4.1). */
export function gradesLineFor(scores: RankedProfessor["scores"], gradeValueKind: GradeValueKind): string {
  const gpa = scores.gpaMean != null ? `GPA ${scores.gpaMean.toFixed(2)}` : "";
  const delta = scores.gpaDelta != null ? `${scores.gpaDelta >= 0 ? "+" : "−"}${Math.abs(scores.gpaDelta).toFixed(2)} vs course` : "";
  return [gpa, delta, gradedCountText(scores, gradeValueKind)].filter(Boolean).join(" · ");
}

function Row({ item, index, reviewsAvailable, gradeValueKind }: { item: RankedProfessor; index: number; reviewsAvailable: boolean; gradeValueKind: GradeValueKind }) {
  const rating = item.scores.ratingShrunk == null ? "—" : item.scores.ratingShrunk.toFixed(1);
  const gpa = item.scores.gpaMean != null ? `GPA ${item.scores.gpaMean.toFixed(2)}` : "";
  const gradesLine = gradesLineFor(item.scores, gradeValueKind);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: 22,
          background: "#e8ecfb",
          color: BRAND,
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {index + 1}
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: 380 }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: INK, overflow: "hidden", whiteSpace: "nowrap" }}>{item.professor.displayName}</div>
        {reviewsAvailable ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 20, color: MUTED }}>
            <span>{rating}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="#d97706" />
            </svg>
            <span>{`· ${item.scores.reviewCount} reviews${gpa ? ` · ${gpa}` : ""}`}</span>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 20, color: MUTED }}>{gradesLine}</div>
        )}
      </div>
      <MiniBar buckets={item.distribution} />
    </div>
  );
}

/** 1200×630 Open Graph card for a subject rankings page (SPEC 3.7): top 3 by default sort + DEMO watermark. */
export default async function Image({ params }: { params: Promise<Params> }) {
  const p = await params;
  const schoolId = toSchoolId(p.school);
  const code = normalizeSubjectCode(p.subject);
  const repo = getRepository();
  const [payload, meta] = schoolId && code
    ? await Promise.all([repo.getRankingsPayload(schoolId, code).catch(() => null), repo.getMeta(schoolId).catch(() => null)])
    : [null, null];
  const flags = payload ? resolveSchoolFlags(payload.school, { mode: payload.mode }) : null;
  const reviewsAvailable = flags?.reviewsAvailable ?? true;
  const gradeValueKind: GradeValueKind = flags?.gradeValueKind ?? "counts";
  const top = payload ? applyRankingsQuery(payload, effectiveQuery(DEFAULT_RANKINGS_QUERY, reviewsAvailable)).ranked.slice(0, 3) : [];
  const demo = payload?.mode === "demo";
  const what = payload?.school.seatStatusAvailable === false ? "offered sections" : "open sections";
  const subtitle = reviewsAvailable ? `Top professors with ${what}` : "Professors ranked by grade curve";
  const gradesSource = meta?.sources.find((s) => /grade|gpa/i.test(s.id) || /grade|gpa/i.test(s.label))?.label ?? null;
  const footer = reviewsAvailable
    ? "Official grade curves + student reviews, filtered to sections you can still get into."
    : gradesFooter(payload?.school.shortName ?? "", gradesSource, flags?.attribution.grades ?? "");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 56,
          background: "linear-gradient(135deg, #ffffff 0%, #f4f5f8 100%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontWeight: 700, color: BRAND }}>
            <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, background: BRAND }} />
            ProfPeek
          </div>
          <div style={{ display: "flex", fontSize: 20, color: MUTED }}>{payload ? termDisplay(payload.term) : ""}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 6 }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: INK }}>
            {payload ? `${payload.subject.code} · ${payload.subject.name}` : "Subject not found"}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
            {payload ? `${subtitle} — ${termDisplay(payload.term)}` : "ProfPeek"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 36 }}>
          {top.length ? (
            top.map((item, i) => <Row key={item.professor.id} item={item} index={i} reviewsAvailable={reviewsAvailable} gradeValueKind={gradeValueKind} />)
          ) : (
            <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
              {reviewsAvailable ? `No ranked professors with ${what} yet.` : "No professors with grade data yet."}
            </div>
          )}
        </div>

        <div style={{ display: "flex", position: "absolute", bottom: 32, left: 56, fontSize: 18, color: "#6b7280" }}>
          {footer}
        </div>

        {demo ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 300,
              left: -60,
              width: 1320,
              justifyContent: "center",
              transform: "rotate(-18deg)",
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: 8,
              color: "rgba(146, 64, 14, 0.18)",
              border: "6px solid rgba(146, 64, 14, 0.18)",
              padding: "8px 24px",
            }}
          >
            DEMO DATA — FICTIONAL
          </div>
        ) : null}
      </div>
    ),
    { ...size },
  );
}
