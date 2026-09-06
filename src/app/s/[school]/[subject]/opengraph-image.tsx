import { ImageResponse } from "next/og";
import type { GradeBuckets, RankedProfessor } from "@/lib/domain/types";
import { getRepository } from "@/lib/repo";
import { SCHOOL_IDS, toSchoolId } from "@/lib/config/schools";
import { normalizeSubjectCode, DEFAULT_RANKINGS_QUERY } from "@/lib/utils/urlState";
import { applyRankingsQuery } from "@/lib/scoring/rank";
import { termDisplay } from "@/lib/utils/term";

type Params = { school: string; subject: string };

export const alt = "ProfPeek — top professors with open sections";
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

function Row({ item, index }: { item: RankedProfessor; index: number }) {
  const rating = item.scores.ratingShrunk == null ? "—" : item.scores.ratingShrunk.toFixed(1);
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 20, color: MUTED }}>
          <span>{rating}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="#d97706" />
          </svg>
          <span>{`· ${item.scores.reviewCount} reviews${item.scores.gpaMean != null ? ` · GPA ${item.scores.gpaMean.toFixed(2)}` : ""}`}</span>
        </div>
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
  const payload = schoolId && code ? await repo.getRankingsPayload(schoolId, code).catch(() => null) : null;
  const top = payload ? applyRankingsQuery(payload, DEFAULT_RANKINGS_QUERY).ranked.slice(0, 3) : [];
  const demo = payload?.mode === "demo";
  const what = payload?.school.seatStatusAvailable === false ? "offered sections" : "open sections";

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
            {payload ? `Top professors with ${what} — ${termDisplay(payload.term)}` : "ProfPeek"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 36 }}>
          {top.length ? (
            top.map((item, i) => <Row key={item.professor.id} item={item} index={i} />)
          ) : (
            <div style={{ display: "flex", fontSize: 26, color: MUTED }}>No ranked professors with {what} yet.</div>
          )}
        </div>

        <div style={{ display: "flex", position: "absolute", bottom: 32, left: 56, fontSize: 18, color: "#6b7280" }}>
          Official grade curves + student reviews, filtered to sections you can still get into.
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
