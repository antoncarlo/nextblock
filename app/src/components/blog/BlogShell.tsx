import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Page frame shared by the blog index and every post: a slim header that gets
 * the reader back to the site, a centred reading column, and the typography for
 * rendered Markdown.
 *
 * The prose styles live here as a scoped <style> block rather than in
 * globals.css because they only ever apply to `.blog-prose`, and keeping them
 * next to the component that owns them means the blog can change without
 * touching the stylesheet every other page shares.
 */
export function BlogShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header
        style={{
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          background: 'var(--bg-primary)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'saturate(180%) blur(8px)',
        }}
      >
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link href="/" className="logo-text" style={{ color: 'var(--text-heading)', fontSize: 17 }}>
            NEXTBLOCK
          </Link>
          <nav style={{ display: 'flex', gap: 20, fontSize: 14 }}>
            <Link href="/blog" style={{ color: 'var(--text-heading)' }}>
              Insights
            </Link>
            <Link href="/docs" style={{ color: 'var(--text-body)' }}>
              Docs
            </Link>
            <Link href="/app" style={{ color: 'var(--accent-navy)' }}>
              Launch App
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 20px 96px' }}>{children}</main>

      <footer
        style={{
          borderTop: '1px solid rgba(0,0,0,0.07)',
          padding: '28px 20px',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text-label)',
        }}
      >
        <Link href="/" style={{ color: 'var(--text-label)' }}>
          nextblock.finance
        </Link>
      </footer>

      <style>{`
        .blog-card {
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 10px;
          background: #fff;
          transition: border-color .18s ease, transform .18s ease;
        }
        .blog-card:hover {
          border-color: var(--accent-navy-border);
          transform: translateY(-1px);
        }
        .blog-prose { font-size: 17px; line-height: 1.75; color: var(--text-body); }
        .blog-prose h2 { font-size: 27px; margin: 44px 0 14px; line-height: 1.25; }
        .blog-prose h3 { font-size: 21px; margin: 32px 0 10px; line-height: 1.3; }
        .blog-prose h4 { font-size: 18px; margin: 26px 0 8px; }
        .blog-prose p { margin: 0 0 18px; }
        .blog-prose strong { color: var(--text-heading); font-weight: 600; }
        .blog-prose blockquote {
          margin: 28px 0;
          padding: 18px 22px;
          background: var(--accent-navy-subtle);
          border-left: 3px solid var(--accent-navy);
          border-radius: 0 8px 8px 0;
        }
        .blog-prose blockquote p { margin: 0 0 10px; }
        .blog-prose blockquote p:last-child { margin-bottom: 0; }
        .blog-table-wrap { overflow-x: auto; margin: 26px 0; }
        .blog-prose table { border-collapse: collapse; width: 100%; font-size: 15px; }
        .blog-prose th, .blog-prose td {
          text-align: left;
          padding: 11px 14px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          vertical-align: top;
        }
        .blog-prose th {
          font-family: 'Inter', system-ui, sans-serif;
          font-weight: 600;
          color: var(--text-heading);
          white-space: nowrap;
        }
        @media (max-width: 600px) {
          .blog-prose { font-size: 16px; }
          .blog-prose h2 { font-size: 23px; }
          .blog-prose h3 { font-size: 19px; }
        }
      `}</style>
    </div>
  );
}
