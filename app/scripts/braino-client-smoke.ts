/**
 * Braino client smoke checks (no external network).
 *
 *   node --experimental-strip-types app/scripts/braino-client-smoke.ts
 *
 * Drives the real client against an in-process HTTP server that signs its answers the
 * way the integration spec requires (X-Braino-Signature = hex(hmac_sha256(secret, raw
 * body))). The server is a test fixture standing in for the vendor's sandbox; nothing
 * here ships. Covers: transport + envelope (spec §2), S1 NAV, S2 risk, S3 claim
 * assessment, the evidence hash (§5), and the keeper's publish decision.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assessClaim,
  assessPortfolioRisk,
  brainoConfigFromEnv,
  BrainoError,
  decideNavPublish,
  fetchNav,
  NAV_HEARTBEAT_SECONDS,
  parseDecimalToUnits,
  unitsToDecimal,
  type BrainoConfig,
  type ClaimAssessmentRequest,
} from '../src/lib/braino/client.ts';
import { BrainoAIAssessor } from '../src/lib/ai-assessor/provider.ts';
import { computeBrainoSignature, sourceHash } from '../src/lib/oracle-node.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'none';
  } catch (e) {
    return e instanceof BrainoError ? e.code : 'other';
  }
}

const SECRET = 'smoke-shared-secret';

// ── fixture server ───────────────────────────────────────────────────────────
type Handler = (path: string, body: string, req: IncomingMessage) => { status?: number; body: string; sig?: string | null; delayMs?: number };
let handler: Handler = () => ({ body: '{}' });
let lastRequest = null as { path: string; body: string; auth: string | undefined } | null;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    lastRequest = { path: req.url ?? '', body, auth: req.headers.authorization };
    const out = handler(req.url ?? '', body, req);
    const send = () => {
      res.statusCode = out.status ?? 200;
      const sig = out.sig === undefined ? computeBrainoSignature(out.body, SECRET) : out.sig;
      if (sig !== null) res.setHeader('x-braino-signature', sig);
      res.setHeader('content-type', 'application/json');
      res.end(out.body);
    };
    if (out.delayMs) setTimeout(send, out.delayMs);
    else send();
  });
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as AddressInfo).port;
const cfg: BrainoConfig = { baseUrl: `http://127.0.0.1:${port}`, hmacSecret: SECRET, apiKey: null };

const NOW = Math.floor(Date.now() / 1000);
const asOf = new Date(NOW * 1000).toISOString();
const VAULT = '0x0123456789abcdef0123456789abcdef01234567';
const signed = (obj: unknown) => ({ body: JSON.stringify(obj) });

// ── decimals ─────────────────────────────────────────────────────────────────
check('decimal: 1234567.123456 -> units', parseDecimalToUnits('1234567.123456') === 1_234_567_123_456n);
check('decimal: 50000.00 -> units', parseDecimalToUnits('50000.00') === 50_000_000_000n);
check('decimal: integer string', parseDecimalToUnits('7') === 7_000_000n);
check('decimal: more than 6 dp refused (no silent rounding)', parseDecimalToUnits('1.1234567') === null);
check('decimal: negative refused', parseDecimalToUnits('-1') === null);
check('decimal: exponent refused', parseDecimalToUnits('1e6') === null);
check('decimal: number type refused', parseDecimalToUnits(5) === null);
check('decimal: units -> string', unitsToDecimal(1_234_567_123_456n) === '1234567.123456');
check('decimal: round trip keeps leading zeros', unitsToDecimal(5n) === '0.000005');

// ── config ───────────────────────────────────────────────────────────────────
{
  check('config: nothing set -> two problems', (() => { const c = brainoConfigFromEnv({}); return !c.ok && c.problems.length === 2; })());
  check('config: http (non-local) refused', (() => { const c = brainoConfigFromEnv({ BRAINO_BASE_URL: 'http://api.example.test', BRAINO_HMAC_SECRET: 'x' }); return !c.ok; })());
  check('config: https accepted', brainoConfigFromEnv({ BRAINO_BASE_URL: 'https://api.example.test', BRAINO_HMAC_SECRET: 'x' }).ok);
  check('config: local http accepted (fixtures)', brainoConfigFromEnv({ BRAINO_BASE_URL: 'http://127.0.0.1:9', BRAINO_HMAC_SECRET: 'x' }).ok);
  const c = brainoConfigFromEnv({ BRAINO_BASE_URL: 'https://api.example.test', BRAINO_HMAC_SECRET: 'x', BRAINO_API_KEY: ' k ' });
  check('config: api key trimmed', c.ok && c.config.apiKey === 'k');
}

// ── S3 claim assessment ──────────────────────────────────────────────────────
const claimReport = { claimId: '12', criteria: { fraud: 'low' }, evidence: [{ checked: true }] };
const goodAssess = {
  reportId: 'brn_2026-10-02_a1',
  modelVersion: 'wavenure-1.2.0',
  asOf,
  confidence: 0.93,
  result: {
    score: 0.81,
    anomaly: 0.12,
    recommendation: 'APPROVE',
    recommendedAmount: '50000.00',
    criteria: { coverage: 'pass', evidence: 'pass', quantification: 'partial', fraud: 'low', terms: 'pass' },
  },
  report: claimReport,
};
const claimReq: ClaimAssessmentRequest = {
  claimId: '12',
  portfolioId: '3',
  requestedAmount: '60000.000000',
  coverageLimit: '1000000.000000',
  policyTerms: { lineOfBusiness: 'Property CAT' },
  evidence: [{ contentHash: '0x' + 'ab'.repeat(32), contentType: 'application/pdf' }],
  description: '',
};
const REQUESTED = 60_000_000_000n;

{
  handler = () => signed(goodAssess);
  const a = await assessClaim(cfg, claimReq, REQUESTED);
  check('S3: score 0.81 -> 8100 bps', a.scoreBps === 8100);
  check('S3: anomaly 0.12 -> 1200 bps', a.anomalyScoreBps === 1200);
  check('S3: confidence 0.93 -> 9300 bps', a.confidenceBps === 9300);
  check('S3: recommendation kept', a.recommendation === 'APPROVE');
  check('S3: recommendedAmount exact', a.recommendedAmount === 50_000_000_000n);
  check('S3: five criteria carried', Object.keys(a.criteria).length === 5 && a.criteria.fraud === 'low');
  check('S3: sourceHash = keccak256(canonical(report)) (spec §5)', a.sourceHash === sourceHash(claimReport));
  check('S3: raw body kept verbatim for the audit', a.rawBody === JSON.stringify(goodAssess));
  check('S3: request went to /v1/assess as JSON', lastRequest?.path === '/v1/assess' && JSON.parse(lastRequest.body).claimId === '12');
  check('S3: no api key -> no authorization header', lastRequest?.auth === undefined);
}
{
  handler = () => signed(goodAssess);
  await assessClaim({ ...cfg, apiKey: 'tok' }, claimReq, REQUESTED);
  check('S3: api key sent as bearer', lastRequest?.auth === 'Bearer tok');
}

// transport failures
{
  handler = () => ({ body: JSON.stringify(goodAssess), sig: null });
  check('transport: unsigned response refused', (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === 'signature');
  handler = () => ({ body: JSON.stringify(goodAssess), sig: computeBrainoSignature(JSON.stringify(goodAssess), 'another-secret') });
  check('transport: wrong secret refused', (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === 'signature');
  handler = () => {
    const tampered = JSON.stringify({ ...goodAssess, result: { ...goodAssess.result, recommendedAmount: '60000.00' } });
    return { body: tampered, sig: computeBrainoSignature(JSON.stringify(goodAssess), SECRET) };
  };
  check('transport: body changed after signing refused', (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === 'signature');
  handler = () => ({ status: 500, body: '{"detail":"secret internal trace"}' });
  check('transport: HTTP 500 refused', (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === 'http');
  handler = () => ({ body: 'not json' });
  check('transport: signed non-JSON refused', (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === 'envelope');
  let msg = '';
  try {
    handler = () => ({ status: 500, body: '{"detail":"secret internal trace"}' });
    await assessClaim(cfg, claimReq, REQUESTED);
  } catch (e) {
    msg = e instanceof Error ? e.message : '';
  }
  check('transport: vendor error body is never echoed', !msg.includes('secret internal trace'));
  handler = () => ({ body: JSON.stringify(goodAssess), delayMs: 400 });
  check('transport: timeout surfaces as timeout', (await codeOf(
    assessClaim(cfg, claimReq, REQUESTED, { timeoutMs: 80 }),
  )) === 'timeout');
  check('transport: unreachable host is a network error', (await codeOf(
    assessClaim({ ...cfg, baseUrl: 'http://127.0.0.1:1' }, claimReq, REQUESTED),
  )) === 'network');
}

// envelope + result validation (each one a separate way to be wrong)
{
  const bad = (patch: Record<string, unknown>) => ({ ...goodAssess, ...patch });
  const badResult = (patch: Record<string, unknown>) => bad({ result: { ...goodAssess.result, ...patch } });
  const cases: Array<[string, unknown, string]> = [
    ['envelope: no reportId', bad({ reportId: '' }), 'envelope'],
    ['envelope: no modelVersion', bad({ modelVersion: undefined }), 'envelope'],
    ['envelope: asOf not a date', bad({ asOf: 'yesterday' }), 'envelope'],
    ['envelope: confidence above 1', bad({ confidence: 1.4 }), 'envelope'],
    ['envelope: confidence as a string', bad({ confidence: '0.9' }), 'envelope'],
    ['envelope: no report', bad({ report: undefined }), 'envelope'],
    ['result: score above 1', badResult({ score: 1.2 }), 'result'],
    ['result: anomaly negative', badResult({ anomaly: -0.1 }), 'result'],
    ['result: unknown recommendation', badResult({ recommendation: 'MAYBE' }), 'result'],
    ['result: recommendedAmount not decimal', badResult({ recommendedAmount: '5e4' }), 'result'],
    ['result: recommendedAmount above the request', badResult({ recommendedAmount: '60000.01' }), 'result'],
    ['result: a criterion is missing', badResult({ criteria: { coverage: 'pass', evidence: 'pass', quantification: 'pass', fraud: 'low' } }), 'result'],
    ['result: criteria absent', badResult({ criteria: undefined }), 'result'],
  ];
  for (const [name, payload, expected] of cases) {
    handler = () => signed(payload);
    check(`${name} refused`, (await codeOf(assessClaim(cfg, claimReq, REQUESTED))) === expected);
  }
}

// the provider end to end
{
  handler = () => signed(goodAssess);
  const provider = new BrainoAIAssessor(cfg);
  const ctx = {
    portfolioId: 3n,
    vault: VAULT,
    claimType: 'NON_PARAMETRIC' as const,
    evidenceHash: '0x' + 'ab'.repeat(32),
    submittedAt: NOW,
    coverageLimit: 1_000_000_000_000n,
    policyTerms: { lineOfBusiness: 'Property CAT', expectedLossBps: 420 },
  };
  const draft = await provider.assess({ claimId: 12n, requestedAmount: REQUESTED, description: '', context: ctx });
  check('provider: draft is tagged braino', draft.provider === 'braino');
  check('provider: APPROVE maps to draft code 0', draft.recommendation === 0);
  check('provider: amounts sent as 6-dp decimals', (() => {
    const sent = JSON.parse(lastRequest!.body);
    return sent.requestedAmount === '60000.000000' && sent.coverageLimit === '1000000.000000' && sent.portfolioId === '3';
  })());
  check('provider: anchor hash sent when no document URL exists', (() => {
    const sent = JSON.parse(lastRequest!.body);
    return sent.evidence.length === 1 && sent.evidence[0].contentHash === ctx.evidenceHash;
  })());
  check('provider: raw body stored verbatim', (draft.raw as { rawBody: string }).rawBody === JSON.stringify(goodAssess));
  check('provider: no context -> refused', (await codeOf(provider.assess({ claimId: 12n, requestedAmount: REQUESTED }))) === 'context');
  check('provider: parametric claim -> refused', (await codeOf(
    provider.assess({ claimId: 12n, requestedAmount: REQUESTED, context: { ...ctx, claimType: 'PARAMETRIC' } }),
  )) === 'context');

  handler = () => signed({ ...goodAssess, result: { ...goodAssess.result, recommendation: 'REVIEW' } });
  check('provider: REVIEW maps to draft code 1', (await provider.assess({ claimId: 12n, requestedAmount: REQUESTED, context: ctx })).recommendation === 1);
  handler = () => signed({ ...goodAssess, result: { ...goodAssess.result, recommendation: 'REJECT', recommendedAmount: '0.00' } });
  check('provider: REJECT maps to draft code 2', (await provider.assess({ claimId: 12n, requestedAmount: REQUESTED, context: ctx })).recommendation === 2);
}

// ── S2 portfolio risk ────────────────────────────────────────────────────────
const DOC = '0x' + 'cd'.repeat(32);
const goodRisk = {
  reportId: 'brn_risk_1',
  modelVersion: 'wavenure-1.2.0',
  asOf,
  confidence: 0.88,
  result: {
    expectedLossBps: 420,
    recommendedPricingBps: 610,
    maxRecommendedCapacity: '5000000.00',
    exclusions: ['flood zones X'],
    riskFactors: [{ name: 'accumulation', weightBps: 1200, note: 'coastal' }],
  },
  report: { documentHash: DOC, notes: 'ok' },
};
const riskReq = { portfolioId: '3', documentHash: DOC, bordereauSummary: {}, treatyTerms: {} };
{
  handler = () => signed(goodRisk);
  const r = await assessPortfolioRisk(cfg, riskReq);
  check('S2: expected loss kept', r.expectedLossBps === 420 && r.recommendedPricingBps === 610);
  check('S2: capacity exact', r.maxRecommendedCapacity === 5_000_000_000_000n);
  check('S2: confidence in bps', r.confidenceBps === 8800);
  check('S2: sourceHash = keccak256(canonical(report))', r.sourceHash === sourceHash(goodRisk.report));
  handler = () => signed({ ...goodRisk, report: { documentHash: '0x' + '11'.repeat(32) } });
  check('S2: report that does not cite the documentHash refused', (await codeOf(assessPortfolioRisk(cfg, riskReq))) === 'result');
  handler = () => signed({ ...goodRisk, result: { ...goodRisk.result, expectedLossBps: 10_001 } });
  check('S2: expectedLossBps above 10000 refused', (await codeOf(assessPortfolioRisk(cfg, riskReq))) === 'result');
  handler = () => signed({ ...goodRisk, result: { ...goodRisk.result, expectedLossBps: 4.5 } });
  check('S2: fractional bps refused', (await codeOf(assessPortfolioRisk(cfg, riskReq))) === 'result');
}

// ── S1 NAV ───────────────────────────────────────────────────────────────────
const navReport = { vault: VAULT, positions: [{ id: 1, value: '1200000.00' }] };
const goodNav = {
  reportId: 'brn_nav_1',
  modelVersion: 'wavenure-1.2.0',
  asOf,
  confidence: 0.93,
  result: { nav: '1234567.123456', currency: 'USDC' },
  report: navReport,
};
const navReq = { chainId: 84532, vaultAddress: VAULT, snapshot: { totalAssets: '1230000000000' } };
{
  handler = () => signed(goodNav);
  const n = await fetchNav(cfg, navReq, NOW);
  check('S1: nav in 6-dp units', n.args.nav === 1_234_567_123_456n);
  check('S1: confidence in bps', n.args.confidenceBps === 9300);
  check('S1: vault lowercased', n.args.vault === VAULT);
  check('S1: sourceHash = keccak256(canonical(vendor report)), not of the flattened args', n.args.sourceHash === sourceHash(navReport));
  check('S1: request went to /v1/nav', lastRequest?.path === '/v1/nav');

  handler = () => signed({ ...goodNav, result: { nav: '1234567.123456', currency: 'EUR' } });
  check('S1: non-USDC refused', (await codeOf(fetchNav(cfg, navReq, NOW))) === 'result');
  handler = () => signed({ ...goodNav, result: { nav: '0.000000', currency: 'USDC' } });
  check('S1: zero NAV refused', (await codeOf(fetchNav(cfg, navReq, NOW))) === 'result');
  handler = () => signed({ ...goodNav, asOf: new Date((NOW - 3600) * 1000).toISOString() });
  check('S1: a one-hour-old figure refused as stale', (await codeOf(fetchNav(cfg, navReq, NOW))) === 'result');
  handler = () => signed({ ...goodNav, asOf: new Date((NOW + 3600) * 1000).toISOString() });
  check('S1: a figure from the future refused', (await codeOf(fetchNav(cfg, navReq, NOW))) === 'result');
  handler = () => signed({ ...goodNav, result: { nav: '1.2345678', currency: 'USDC' } });
  check('S1: seven decimals refused', (await codeOf(fetchNav(cfg, navReq, NOW))) === 'result');
}

// ── keeper publish decision ──────────────────────────────────────────────────
{
  const base = {
    newNav: 1_000_000n,
    lastNav: 1_000_000n,
    lastUpdatedAt: NOW - 60,
    feedPaused: false,
    deviationWaiver: false,
    maxDeviationBps: 2_000n,
    nowSeconds: NOW,
  };
  check('decide: no prior attestation -> publish (first)', (() => { const d = decideNavPublish({ ...base, lastNav: null, lastUpdatedAt: null }); return d.action === 'publish' && d.reason === 'first'; })());
  check('decide: unchanged and fresh -> skip', decideNavPublish(base).action === 'skip');
  check('decide: unchanged but heartbeat due -> publish', (() => { const d = decideNavPublish({ ...base, lastUpdatedAt: NOW - NAV_HEARTBEAT_SECONDS }); return d.action === 'publish' && d.reason === 'heartbeat'; })());
  check('decide: small move -> publish (changed)', (() => { const d = decideNavPublish({ ...base, newNav: 1_100_000n }); return d.action === 'publish' && d.reason === 'changed'; })());
  check('decide: exactly at the guard -> publish', decideNavPublish({ ...base, newNav: 1_200_000n }).action === 'publish');
  check('decide: just past the guard -> withhold', (() => { const d = decideNavPublish({ ...base, newNav: 1_200_100n }); return d.action === 'withhold' && d.reason === 'deviation'; })());
  check('decide: drop past the guard -> withhold', decideNavPublish({ ...base, newNav: 700_000n }).action === 'withhold');
  check('decide: Sentinel waiver lets a big move through', decideNavPublish({ ...base, newNav: 5_000_000n, deviationWaiver: true }).action === 'publish');
  check('decide: paused feed -> withhold, whatever the number', (() => { const d = decideNavPublish({ ...base, newNav: 1_000_001n, feedPaused: true }); return d.action === 'withhold' && d.reason === 'feed_paused'; })());
}

server.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
