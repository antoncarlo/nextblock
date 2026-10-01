import type { Metadata } from 'next';
import Link from 'next/link';
import { getArticles, getChapters, formatDate } from '@/lib/blog/content';
import { BlogShell } from '@/components/blog/BlogShell';

export const metadata: Metadata = {
  title: 'Insights | NextBlock',
  description:
    'Market notes on reinsurance, catastrophe bonds and insurance-linked securities, plus a four-chapter playbook on tokenizing reinsurance portfolios.',
};

export default function BlogIndexPage() {
  const articles = getArticles();
  const chapters = getChapters();

  return (
    <BlogShell>
      <header style={{ marginBottom: 56 }}>
        <p className="section-label" style={{ marginBottom: 14 }}>
          Insights
        </p>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', lineHeight: 1.1, marginBottom: 20 }}>
          Notes from the reinsurance market
        </h1>
        <p style={{ fontSize: 18, maxWidth: '62ch', color: 'var(--text-body)' }}>
          Short pieces on how reinsurance capital actually moves, and a longer playbook on what
          changes when a portfolio is tokenized. Every technical term is explained the first time it
          appears.
        </p>
      </header>

      <section aria-labelledby="playbook-heading" style={{ marginBottom: 64 }}>
        <h2 id="playbook-heading" style={{ fontSize: 26, marginBottom: 8 }}>
          The playbook
        </h2>
        <p style={{ marginBottom: 24, color: 'var(--text-body)' }}>
          Four chapters, read in order, on the bridge between reinsurance and on-chain capital.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {chapters.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/blog/${c.slug}`}
                className="blog-card"
                style={{ display: 'block', padding: '20px 22px' }}
              >
                <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>
                  Chapter {c.chapter} &middot; {c.readingMinutes} min read
                </span>
                <span
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 21,
                    color: 'var(--text-heading)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {c.title}
                </span>
                <span style={{ color: 'var(--text-body)', fontSize: 15 }}>{c.description}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" style={{ fontSize: 26, marginBottom: 8 }}>
          Market notes
        </h2>
        <p style={{ marginBottom: 24, color: 'var(--text-body)' }}>
          {articles.length} short reads, newest first.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
          {articles.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/blog/${a.slug}`}
                className="blog-card"
                style={{ display: 'block', padding: '20px 22px' }}
              >
                <span className="section-label" style={{ display: 'block', marginBottom: 8 }}>
                  <time dateTime={a.date}>{formatDate(a.date)}</time> &middot; {a.readingMinutes} min
                  read
                </span>
                <span
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 21,
                    color: 'var(--text-heading)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {a.title}
                </span>
                <span style={{ color: 'var(--text-body)', fontSize: 15 }}>{a.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </BlogShell>
  );
}
