import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the blog corpus off disk at build time and turns it into HTML.
 *
 * The corpus uses a deliberately small slice of Markdown: h2, h3, tables,
 * blockquotes, bold and paragraphs. No lists, links, images or fenced code
 * appear anywhere in the fifteen files. A dependency that handles the whole
 * CommonMark grammar would pull a parser, a renderer and their transitive tree
 * into an npm surface that was just cleared of high and critical advisories,
 * to render six constructs. So this renders those six and refuses the rest.
 *
 * If the corpus ever grows a construct this does not cover, `renderMarkdown`
 * emits it as a plain paragraph rather than silently dropping it, and the
 * corpus test fails loudly.
 */

export type PostKind = 'article' | 'chapter';

export interface Post {
  kind: PostKind;
  slug: string;
  title: string;
  description: string;
  /** ISO date. Articles carry one; chapters do not. */
  date?: string;
  category?: string;
  tags: string[];
  /** Chapter order, 1-based. Chapters only. */
  chapter?: number;
  html: string;
  readingMinutes: number;
}

const ARTICLES_DIR = path.join(process.cwd(), 'content', 'blog');
const PLAYBOOK_DIR = path.join(process.cwd(), 'content', 'playbook');

/** Escapes the four characters that could otherwise close or open a tag. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline pass: bold then italic, over already-escaped text. */
function renderInline(raw: string): string {
  return escapeHtml(raw)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

interface FrontMatter {
  [key: string]: string;
}

/**
 * Splits the leading `---` block from the body.
 * Values are read as plain strings; `tags` is the one list-shaped field and is
 * parsed from its `[a, b]` form by the caller.
 */
function splitFrontMatter(source: string): { meta: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { meta: {}, body: source };

  const meta: FrontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: source.slice(match[0].length) };
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** A `|`-delimited row, minus its outer pipes. */
function tableCells(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

const TABLE_DIVIDER = /^\|?[\s:-]*-[\s|:-]*\|?$/;

function renderMarkdown(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Headings. The corpus has no h1 in the body: the title owns that level.
    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote: the "In plain words" boxes. Consecutive `>` lines, with a
    // bare `>` acting as a paragraph break inside the quote.
    if (line.startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const paragraphs = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${renderInline(p.replace(/\n/g, ' '))}</p>`)
        .join('');
      out.push(`<blockquote>${paragraphs}</blockquote>`);
      continue;
    }

    // Table: a header row, a divider, then body rows.
    if (line.startsWith('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header = tableCells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(tableCells(lines[i]));
        i++;
      }
      const head = header.map((c) => `<th>${renderInline(c)}</th>`).join('');
      const bodyRows = rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="blog-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></div>`);
      continue;
    }

    // Paragraph: everything up to the next blank line.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('>') && !lines[i].startsWith('|') && !/^#{2,4}\s/.test(lines[i])) {
      paragraph.push(lines[i].trim());
      i++;
    }
    if (paragraph.length) out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return out.join('\n');
}

/** Average adult reading speed, rounded up so a short piece never reads "0 min". */
function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function readDir(dir: string, kind: PostKind): Post[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      const { meta, body } = splitFrontMatter(source);
      return {
        kind,
        slug: meta.slug ?? file.replace(/\.md$/, ''),
        title: meta.title ?? 'Untitled',
        description: meta.description ?? '',
        date: meta.date,
        category: meta.category,
        tags: parseTags(meta.tags),
        chapter: meta.chapter ? Number(meta.chapter) : undefined,
        html: renderMarkdown(body),
        readingMinutes: readingMinutes(body),
      };
    });
}

/** Articles, newest first. */
export function getArticles(): Post[] {
  return readDir(ARTICLES_DIR, 'article').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/** Playbook chapters, in reading order. */
export function getChapters(): Post[] {
  return readDir(PLAYBOOK_DIR, 'chapter').sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
}

export function getAllPosts(): Post[] {
  return [...getArticles(), ...getChapters()];
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((p) => p.slug === slug);
}

/** Formats an ISO date for display without pulling in a date library. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}
