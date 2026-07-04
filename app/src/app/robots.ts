import type { MetadataRoute } from 'next';

/** Public site is indexable; internals and the admin dashboard are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: 'https://www.nextblock.finance/sitemap.xml',
  };
}
