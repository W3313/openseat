// SPEC 3.8 / F23: allow crawlers on the static pages and point at the sitemap. The JSON API and the
// per-request /compare page are excluded: they are not content for search engines, and every distinct
// ?subject= / ?p= permutation a crawler follows would be a fresh serverless invocation.
import type { MetadataRoute } from 'next';
import { siteUrl } from "@/lib/config/env";

export const SITE_URL = siteUrl.replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/compare/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
