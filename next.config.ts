import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy for a statically prerendered Next 16 app.
 *
 * Why `'unsafe-inline'` for scripts and styles: every page is prerendered at build time, and Next's
 * React Server Components payload is delivered through inline `<script>` tags with no nonce. A
 * nonce-based policy needs a per-request nonce (a proxy/middleware) and forces every page to render
 * dynamically, which would give up the CDN-served static pages that keep the site cheap on Vercel's
 * Hobby plan. Inline `style` attributes are emitted by recharts, the GradeBar/GpaTrendChart charts and
 * the theme tokens, so style-src needs it too. Hash-based script allow-listing or a nonce proxy is the
 * follow-up if the site ever renders dynamically anyway.
 *
 * What the policy still enforces: no scripts, styles, fonts, images or fetches from foreign origins
 * (reviews and model output are rendered on every page, so an injection could not phone home), no
 * plugins, no `<base>` hijack, no form exfiltration, no framing (clickjacking).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

/** Sent with every response (pages, API routes, OG images). Exported for the smoke test. */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()" },
  // Vercel adds HSTS on *.vercel.app; sending it ourselves covers custom domains too. Harmless over http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework (`X-Powered-By: Next.js`).
  poweredByHeader: false,
  // The JsonRepository reads data/processed/<school>/*.json with fs at request time (API routes and the
  // ISR-rendered professor pages). Vercel's output file tracing only bundles files that are statically
  // imported, so include every committed school dataset for every route (MULTI_SCHOOL_DESIGN §3).
  outputFileTracingIncludes: {
    "/**": ["./data/processed/**"],
  },
  // Grade-row files are only used by the ingest pipeline; keep them out of every serverless bundle.
  outputFileTracingExcludes: {
    "/**": ["./data/processed/*/grades/**"],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      // /compare/[school] reads searchParams and is therefore rendered per request, but nothing on it depends on
      // the viewer (shortlist state lives in localStorage), so let the CDN cache each distinct ?p= for a day.
      {
        source: "/compare/:school",
        headers: [{ key: "Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
