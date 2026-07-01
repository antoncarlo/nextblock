/**
 * Smoke: IPFS/Pinata pure helpers + the real-documentHash portfolio path.
 * Runs under `node --experimental-strip-types` — no network, no bundler.
 */
import { isPinataConfigured, gatewayUrlFor } from '../src/lib/ipfs/pinata.ts';
import { validatePortfolioForm, type PortfolioFormInput } from '../src/lib/portfolio/form.ts';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failures++;
}

// --- Pinata config gating ---
check('isPinataConfigured false without JWT', isPinataConfigured({} as NodeJS.ProcessEnv) === false);
check(
  'isPinataConfigured true with JWT',
  isPinataConfigured({ PINATA_JWT: 'x' } as unknown as NodeJS.ProcessEnv) === true,
);

// --- Gateway URL resolution ---
const cid = 'bafkreigh2akiscaildc';
check(
  'gatewayUrlFor uses dedicated gateway',
  gatewayUrlFor(cid, { PINATA_GATEWAY: 'blush-fashionable-limpet-75.mypinata.cloud' } as unknown as NodeJS.ProcessEnv) ===
    `https://blush-fashionable-limpet-75.mypinata.cloud/ipfs/${cid}`,
);
check(
  'gatewayUrlFor strips scheme/trailing slash',
  gatewayUrlFor(cid, { PINATA_GATEWAY: 'https://gw.example.com/' } as unknown as NodeJS.ProcessEnv) ===
    `https://gw.example.com/ipfs/${cid}`,
);
check(
  'gatewayUrlFor falls back to public gateway',
  gatewayUrlFor(cid, {} as NodeJS.ProcessEnv) === `https://gateway.pinata.cloud/ipfs/${cid}`,
);

// --- Real pinned documentHash supersedes the typed evidence reference ---
const base: PortfolioFormInput = {
  name: 'EU Property CAT QS 2026',
  lineOfBusiness: 'Property CAT',
  jurisdiction: 'EU',
  structureType: 0,
  coverageLimit: '10000000',
  cededPremium: '500000',
  inceptionDate: '2026-01-01',
  expiryDate: '2026-12-31',
  metadataURI: 'ipfs://bafkreipinnedmanifestcid',
  evidenceReference: '',
  pinnedDocumentHash: `0x${'ab'.repeat(32)}` as `0x${string}`,
};

const pinned = validatePortfolioForm(base);
check('valid with pinned hash + empty evidence reference', pinned.ok === true);
check(
  'on-chain documentHash equals the real pinned hash',
  pinned.ok === true && pinned.params.documentHash === base.pinnedDocumentHash,
);
check('metadataURI carried through as ipfs uri', pinned.ok === true && pinned.params.metadataURI === base.metadataURI);

// --- Legacy path still works (no pin: derive from evidence reference) ---
const legacy = validatePortfolioForm({ ...base, pinnedDocumentHash: undefined, evidenceReference: 'treaty-2026-ref' });
check('legacy evidence-reference path still valid', legacy.ok === true);
check(
  'legacy documentHash is derived (not the pinned value)',
  legacy.ok === true && legacy.params.documentHash !== base.pinnedDocumentHash,
);

// --- Missing both pin and reference is rejected ---
const neither = validatePortfolioForm({ ...base, pinnedDocumentHash: undefined, evidenceReference: '' });
check('rejected when neither pinned hash nor evidence reference', neither.ok === false);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
