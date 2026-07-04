import type { MetadataRoute } from 'next';

const BASE = 'https://www.nextblock.finance';

/** Core public surfaces only — role-gated and wallet-bound routes stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/app`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/app/apply`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/app/money-flow`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
