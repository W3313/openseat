// SPEC 3.8 / F23: allow all crawlers and point at the sitemap.
import type { MetadataRoute } from 'next';
import { siteUrl } from "@/lib/config/env";

export const SITE_URL = siteUrl.replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
