import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The JsonRepository reads data/processed/<school>/*.json with fs at request time. Vercel's output file
  // tracing only bundles files that are statically imported, so include the processed dataset for every route.
  outputFileTracingIncludes: {
    "/**": ["./data/processed/**"],
  },
};

export default nextConfig;
