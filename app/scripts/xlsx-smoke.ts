/**
 * Smoke: minimal .xlsx reader (ZIP + OOXML) → bordereau aggregation.
 * Builds a real xlsx in memory — one entry stored (method 0), one deflated
 * (method 8) so the DecompressionStream path is exercised too.
 * Runs under `node --experimental-strip-types` — no network.
 */
import { deflateRawSync } from 'node:zlib';
import { parseXlsx, isZipFile } from '../src/lib/portfolio/xlsx.ts';
import { summarizeBordereauRows } from '../src/lib/portfolio/bordereau.ts';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

// --- tiny ZIP writer (stored / deflate), CRC left at 0 (reader ignores it) ---
interface ZipInput { name: string; data: Uint8Array; deflate: boolean }
function buildZip(files: ZipInput[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const payload = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const method = f.deflate ? 8 : 0;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);

    chunks.push(local, payload);
    offset += local.length + payload.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { chunks.push(c); cdSize += c.length; }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// --- workbook: shared strings (incl. rich text + entity), 2 policy rows ---
const enc = new TextEncoder();
const sharedXml = `<?xml version="1.0"?><sst><si><t>Policy Ref</t></si><si><t>Insured</t></si><si><t>Sum Insured</t></si><si><t>Ceded Premium</t></si><si><t>Inception</t></si><si><t>Expiry</t></si><si><t>Line of Business</t></si><si><t>Country</t></si><si><t>POL-001</t></si><si><t>Acme &amp; Co</t></si><si><r><t>Property </t></r><r><t>CAT</t></r></si><si><t>EU</t></si><si><t>Beta GmbH</t></si></sst>`;

// Dates as Excel serials: 46023 = 2026-01-01, 46387 = 2026-12-31, 46054 = 2026-02-01, 46356 = 2026-11-30.
const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>` +
  `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c><c r="G1" t="s"><v>6</v></c><c r="H1" t="s"><v>7</v></c></row>` +
  `<row r="2"><c r="A2" t="s"><v>8</v></c><c r="B2" t="s"><v>9</v></c><c r="C2"><v>10000000</v></c><c r="D2"><v>50000</v></c><c r="E2"><v>46023</v></c><c r="F2"><v>46387</v></c><c r="G2" t="s"><v>10</v></c><c r="H2" t="s"><v>11</v></c></row>` +
  `<row r="3"><c r="A3" t="inlineStr"><is><t>POL-002</t></is></c><c r="B3" t="s"><v>12</v></c><c r="C3"><v>5000000</v></c><c r="D3"><v>25000</v></c><c r="E3"><v>46054</v></c><c r="F3"><v>46356</v></c><c r="G3" t="s"><v>10</v></c><c r="H3" t="s"><v>11</v></c></row>` +
  `</sheetData></worksheet>`;

const xlsx = buildZip([
  { name: 'xl/sharedStrings.xml', data: enc.encode(sharedXml), deflate: false }, // stored path
  { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml), deflate: true }, // deflate path
]);

check('isZipFile true for built xlsx', isZipFile(xlsx));
check('isZipFile false for csv bytes', !isZipFile(enc.encode('a,b,c\n1,2,3')));

const rows = await parseXlsx(xlsx);
check('3 rows parsed', rows.length === 3);
check('header via shared strings', rows[0][2] === 'Sum Insured');
check('xml entity decoded', rows[1][1] === 'Acme & Co');
check('rich-text runs concatenated', rows[1][6] === 'Property CAT');
check('inline string cell', rows[2][0] === 'POL-002');
check('numeric cell as plain text', rows[1][2] === '10000000');
check('date serial preserved', rows[1][4] === '46023');

const res = summarizeBordereauRows(rows);
check('summary ok', res.ok === true);
if (res.ok) {
  const s = res.summary;
  check('policyCount = 2', s.policyCount === 2);
  check('coverage aggregate = 15,000,000', s.coverageLimit === '15000000.00');
  check('premium aggregate = 75,000', s.cededPremium === '75000.00');
  check('inception from serial = 2026-01-01', s.inceptionDate === '2026-01-01');
  check('expiry from serial = 2026-12-31', s.expiryDate === '2026-12-31');
  check('line of business modal', s.lineOfBusiness === 'Property CAT');
  check('jurisdiction modal', s.jurisdiction === 'EU');
}

// Sparse row: missing B column must pad with empty string.
const sparseSheet = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c><c r="C1"><v>7</v></c></row></sheetData></worksheet>`;
const sparse = await parseXlsx(buildZip([{ name: 'xl/worksheets/sheet1.xml', data: enc.encode(sparseSheet), deflate: false }]));
check('sparse row padded', sparse[0].length === 3 && sparse[0][1] === '' && sparse[0][2] === '7');

// A zip without any worksheet must throw, not return garbage.
let threw = false;
try {
  await parseXlsx(buildZip([{ name: 'xl/styles.xml', data: enc.encode('<x/>'), deflate: false }]));
} catch { threw = true; }
check('no-worksheet workbook throws', threw);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
