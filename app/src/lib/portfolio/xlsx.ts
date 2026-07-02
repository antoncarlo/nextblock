/**
 * Minimal .xlsx reader (pure, ZERO dependencies).
 *
 * An .xlsx file is a ZIP archive of XML parts. This module reads just enough
 * of both formats to turn the FIRST worksheet of a bordereau workbook into
 * rows of display strings for the aggregator in ./bordereau.ts — it is not a
 * general spreadsheet engine.
 *
 * Deliberate scope limits (documented, fail-loud where they matter):
 *  - ZIP: stored (method 0) and deflate (method 8) entries only — the only
 *    methods Excel writes. Deflate uses the platform-native
 *    DecompressionStream('deflate-raw') (browsers, Node >= 21.2; Vercel is on
 *    Node 24). CRCs are not re-verified: a corrupt archive surfaces as an XML
 *    parse failure and a hard error, never as silent wrong numbers.
 *  - Sheet selection: lowest-numbered xl/worksheets/sheetN.xml (bordereaux are
 *    single-sheet exports). Multi-sheet workbooks: keep the schedule on the
 *    first sheet.
 *  - Dates: numeric date cells surface as Excel serials, which
 *    parseBordereauDate already understands. The legacy 1904 date system
 *    (pre-2011 Mac Excel) is not supported.
 *  - Legacy binary .xls is NOT supported — export as .xlsx or CSV.
 *
 * Shared by the PortfolioPanel UI (client) and the node --experimental-strip-
 * types smoke, so: no React, no server-only imports.
 */

/** True when the bytes look like a ZIP container (covers .xlsx). */
export function isZipFile(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// --- ZIP container ---

interface ZipEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD is at the very end, preceded by a comment of at most 64 KiB.
  const scanFloor = Math.max(0, bytes.length - 65_558);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('xlsx: not a valid ZIP archive (no end-of-central-directory)');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let n = 0; n < entryCount; n++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIG) throw new Error('xlsx: corrupt ZIP central directory');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localHeaderOffset;
  if (view.getUint32(at, true) !== LOCAL_SIG) throw new Error(`xlsx: corrupt local header for ${entry.name}`);
  // The local header repeats name/extra with its OWN lengths — trust those.
  const nameLen = view.getUint16(at + 26, true);
  const extraLen = view.getUint16(at + 28, true);
  const dataStart = at + 30 + nameLen + extraLen;
  const raw = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRaw(raw);
  throw new Error(`xlsx: unsupported compression method ${entry.method} for ${entry.name}`);
}

// --- XML helpers (regex over controlled OOXML output, not a generic parser) ---

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Concatenate every <t>…</t> in a fragment (handles rich-text runs). */
function textRuns(fragment: string): string {
  let out = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += decodeXml(m[1]);
  return out;
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const m of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) strings.push(textRuns(m[1]));
  return strings;
}

/** "BC" -> 54 (0-based column index). */
function columnIndex(ref: string): number {
  let col = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    col = col * 26 + (c - 64);
  }
  return col - 1;
}

/** Normalize a numeric cell ("1E7", "45123.0") to plain decimal text. */
function normalizeNumber(v: string): string {
  const n = Number(v);
  // String() never uses scientific notation below 1e21 — plenty for USDC.
  return Number.isFinite(n) ? String(n) : v;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const col = ref !== undefined ? columnIndex(ref) : cells.length;

      let value = '';
      if (type === 'inlineStr') {
        value = textRuns(body);
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
        if (type === 's') {
          value = shared[Number(v)] ?? '';
        } else if (type === 'str' || type === 'd' || type === 'b') {
          value = decodeXml(v);
        } else {
          value = v === '' ? '' : normalizeNumber(decodeXml(v));
        }
      }
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

/**
 * Read the first worksheet of an .xlsx workbook into rows of strings,
 * ready for summarizeBordereauRows(). Throws with a descriptive message on
 * anything unsupported — never returns silently-wrong data.
 */
export async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  if (!isZipFile(bytes)) throw new Error('xlsx: not an .xlsx file (missing ZIP signature)');
  const entries = readCentralDirectory(bytes);

  const sheets = entries
    .map(e => ({ e, m: /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(e.name) }))
    .filter((x): x is { e: ZipEntry; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
  if (sheets.length === 0) throw new Error('xlsx: no worksheet found in the workbook');

  const decoder = new TextDecoder();
  const sharedEntry = entries.find(e => e.name === 'xl/sharedStrings.xml');
  const shared = sharedEntry ? parseSharedStrings(decoder.decode(await extractEntry(bytes, sharedEntry))) : [];

  const sheetXml = decoder.decode(await extractEntry(bytes, sheets[0].e));
  return parseSheet(sheetXml, shared);
}
