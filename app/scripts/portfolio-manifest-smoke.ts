/**
 * Smoke: public integrity manifest for confidential portfolio documents.
 * Runs under `node --experimental-strip-types` — pure, no network.
 */
import { buildDocumentManifest, PORTFOLIO_MANIFEST_KIND } from '../src/lib/portfolio/manifest.ts';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

const hash = `0x${'ab'.repeat(32)}` as `0x${string}`;
const m = buildDocumentManifest({
  documentHash: hash,
  fileName: 'bordereau-q1-2026.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 123_456,
  uploader: '0xAbCd000000000000000000000000000000001234',
  uploadedAt: new Date('2026-07-02T10:00:00Z'),
});

check('kind is versioned', m.kind === PORTFOLIO_MANIFEST_KIND && m.kind.endsWith('.v1'));
check('documentHash carried verbatim', m.documentHash === hash);
check('uploader lowercased', m.uploader === '0xabcd000000000000000000000000000000001234');
check('uploadedAt ISO', m.uploadedAt === '2026-07-02T10:00:00.000Z');
check('storage class is private-bucket', m.storage === 'private-bucket');
check('note mentions the on-chain link', m.note.includes('documentHash'));

// The manifest is world-readable forever: nothing content-derived may leak in.
const serialized = JSON.stringify(m);
check('JSON serializable + roundtrip', JSON.parse(serialized).documentHash === hash);
const allowedKeys = ['kind', 'documentHash', 'fileName', 'contentType', 'sizeBytes', 'uploader', 'uploadedAt', 'storage', 'note'];
check('no unexpected fields (no content leakage surface)', Object.keys(m).every(k => allowedKeys.includes(k)));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
