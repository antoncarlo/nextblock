import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPosts, getPostBySlug, formatDate } from '@/lib/blog/content';
import { BlogShell } from '@/components/blog/BlogShell';

/** Every post is known at build time, so each one is prerendered as static HTML. */
export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Not found | NextBlock' };

  return {
    title: `${post.title} | NextBlock`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const chapters = getAllPosts().filter((p) => p.kind === 'chapter');
  const nextChapter =
    post.kind === 'chapter' ? chapters.find((c) => (c.chapter ?? 0) === (post.chapter ?? 0) + 1) : undefined;

  return (
    <BlogShell>
      <article>
        <Link
          href="/blog"
          className="section-label"
          style={{ display: 'inline-block', marginBottom: 22 }}
        >
          &larr; All insights
        </Link>

        <header style={{ marginBottom: 36 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>
            {post.kind === 'chapter' ? (
              <>Playbook &middot; Chapter {post.chapter}</>
            ) : (
              <>
                {post.category} &middot; <time dateTime={post.date}>{formatDate(post.date)}</time>
              </>
            )}{' '}
            &middot; {post.readingMinutes} min read
          </p>

          <h1 style={{ fontSize: 'clamp(30px, 4.6vw, 44px)', lineHeight: 1.15, marginBottom: 18 }}>
            {post.title}
          </h1>

          <p style={{ fontSize: 18, color: 'var(--text-body)', margin: 0 }}>{post.description}</p>
        </header>

        {/* The corpus is authored in-house and rendered by our own Markdown pass,
            which escapes every input before emitting tags. No third-party or
            user-submitted content reaches this. */}
        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

        {post.tags.length > 0 && (
          <footer style={{ marginTop: 48, paddingTop: 22, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
            <p className="section-label" style={{ marginBottom: 10 }}>
              Topics
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {post.tags.map((t) => (
                <li
                  key={t}
                  style={{
                    fontSize: 13,
                    padding: '5px 11px',
                    borderRadius: 999,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-body)',
                  }}
                >
                  {t}
                </li>
              ))}
            </ul>
          </footer>
        )}

        {nextChapter && (
          <nav style={{ marginTop: 40 }}>
            <Link href={`/blog/${nextChapter.slug}`} className="blog-card" style={{ display: 'block', padding: '18px 22px' }}>
              <span className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                Next &middot; Chapter {nextChapter.chapter}
              </span>
              <span
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 19,
                  color: 'var(--text-heading)',
                }}
              >
                {nextChapter.title}
              </span>
            </Link>
          </nav>
        )}
      </article>
    </BlogShell>
  );
}
