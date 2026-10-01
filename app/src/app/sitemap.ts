import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog/content';

const BASE = 'https://www.nextblock.finance';

/** Core public surfaces only — role-gated and wallet-bound routes stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/app`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/app/apply`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/app/transparency`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${BASE}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    // Each post is listed so the corpus is discoverable without a crawl of the index.
    ...getAllPosts().map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
