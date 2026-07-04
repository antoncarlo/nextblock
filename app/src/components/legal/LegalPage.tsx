import Link from 'next/link';

/**
 * Shared shell for the public legal pages (/privacy, /terms). Institutional
 * styling consistent with the landing (Playfair headings, navy accents).
 * Content is passed as structured sections so the pages stay maintainable;
 * the canonical source texts live in docs/PRIVACY.md and docs/TERMS.md and
 * must be kept in sync (both files link here as the live version).
 */

export interface LegalSection {
  heading?: string;
  /** Paragraphs; a leading "• " renders as a list item. */
  body: string[];
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
  anchorFirstSection,
}: {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
  anchorFirstSection?: string;
}) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <Link href="/" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#1B3A6B', textDecoration: 'none' }}>
          ← NextBlock
        </Link>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 500,
            color: '#0F1218',
            margin: '18px 0 6px',
          }}
        >
          {title}
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', marginBottom: 28 }}>
          Last updated: {updated} · Base Sepolia staging deployment
        </p>

        {intro.map((p, i) => (
          <p key={i} style={paragraphStyle}>
            {p}
          </p>
        ))}

        {sections.map((s, i) => (
          <section key={i} id={i === 0 ? anchorFirstSection : undefined}>
            {s.heading && (
              <h2
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#1B3A6B',
                  margin: '32px 0 10px',
                }}
              >
                {s.heading}
              </h2>
            )}
            {renderBody(s.body)}
          </section>
        ))}

        <p style={{ ...paragraphStyle, marginTop: 40, fontSize: 13, color: '#6B7280' }}>
          The source-controlled version of this document lives in the public repository
          (github.com/antoncarlo/nextblock). Questions: see the security and operations contacts there.
        </p>
      </div>
    </div>
  );
}

const paragraphStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 15,
  lineHeight: 1.75,
  color: '#374151',
  margin: '0 0 14px',
};

function renderBody(body: string[]) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: number) => {
    if (list.length > 0) {
      out.push(
        <ul key={`ul-${key}`} style={{ ...paragraphStyle, paddingLeft: 22, listStyle: 'disc' }}>
          {list.map((li, j) => (
            <li key={j} style={{ marginBottom: 6 }}>
              {li}
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  body.forEach((p, i) => {
    if (p.startsWith('• ')) {
      list.push(p.slice(2));
    } else {
      flush(i);
      out.push(
        <p key={i} style={paragraphStyle}>
          {p}
        </p>,
      );
    }
  });
  flush(body.length);
  return out;
}
