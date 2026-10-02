/**
 * Provider selection smoke — the rule "on production only real providers run".
 *
 *   node --experimental-strip-types app/scripts/providers-smoke.ts
 *
 * Covers the factories of the four pluggable surfaces (sanctions, wallet screening,
 * e-mail, AI) and the status each one reports, with the environment of production, of a
 * preview/CI/local run, and of each misconfiguration. No network.
 */

import { getSanctionsProvider } from '../src/lib/sanctions/provider.ts';
import { getWalletScreeningProvider } from '../src/lib/sanctions/wallet-provider.ts';
import { getEmailProvider } from '../src/lib/email/provider.ts';
import { getAIAssessorProvider } from '../src/lib/ai-assessor/provider.ts';
import { MockProviderForbiddenError, isProduction } from '../src/lib/providers/production.ts';
import { readProviderStatus } from '../src/lib/providers/status.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}
function outcome(fn: () => { name: string }): string {
  try {
    return fn().name;
  } catch (e) {
    return e instanceof MockProviderForbiddenError ? 'FORBIDDEN' : 'THROWS';
  }
}

const PROD = { VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL_ENV: 'preview' };
const BRAINO = { BRAINO_BASE_URL: 'https://api.example.test', BRAINO_HMAC_SECRET: 's' };

check('production is the Vercel production deployment only', isProduction(PROD) && !isProduction(PREVIEW) && !isProduction({}));

// ── sanctions ────────────────────────────────────────────────────────────────
check('sanctions: dev default is the fixture', outcome(() => getSanctionsProvider({})) === 'mock');
check('sanctions: preview default is the fixture', outcome(() => getSanctionsProvider(PREVIEW)) === 'mock');
check('sanctions: production default is the official lists', outcome(() => getSanctionsProvider(PROD)) === 'ofac-list');
check('sanctions: production refuses an explicit mock', outcome(() => getSanctionsProvider({ ...PROD, SANCTIONS_PROVIDER: 'mock' })) === 'FORBIDDEN');
check('sanctions: the official lists are selectable anywhere', outcome(() => getSanctionsProvider({ SANCTIONS_PROVIDER: 'ofac-list' })) === 'ofac-list');
check('sanctions: complyadvantage without its key throws', outcome(() => getSanctionsProvider({ SANCTIONS_PROVIDER: 'complyadvantage' })) === 'THROWS');
check('sanctions: complyadvantage with its key', outcome(() => getSanctionsProvider({ SANCTIONS_PROVIDER: 'complyadvantage', COMPLY_ADVANTAGE_API_KEY: 'k' })) === 'complyadvantage');
check('sanctions: an unknown name throws, it does not fall back to the fixture', outcome(() => getSanctionsProvider({ SANCTIONS_PROVIDER: 'oops' })) === 'THROWS');

// ── wallet screening ─────────────────────────────────────────────────────────
check('wallet: dev default is the fixture', outcome(() => getWalletScreeningProvider({})) === 'mock');
check('wallet: production default is the real oracle', outcome(() => getWalletScreeningProvider(PROD)) === 'chainalysis-oracle');
check('wallet: production refuses an explicit mock', outcome(() => getWalletScreeningProvider({ ...PROD, WALLET_SCREENING_PROVIDER: 'mock' })) === 'FORBIDDEN');
check('wallet: an unknown name throws', outcome(() => getWalletScreeningProvider({ WALLET_SCREENING_PROVIDER: 'trm' })) === 'THROWS');

// ── e-mail ───────────────────────────────────────────────────────────────────
check('email: dev default is the fixture', outcome(() => getEmailProvider({})) === 'mock');
check('email: production default sends nothing and says so', outcome(() => getEmailProvider(PROD)) === 'none');
check('email: production refuses an explicit mock', outcome(() => getEmailProvider({ ...PROD, EMAIL_PROVIDER: 'mock' })) === 'FORBIDDEN');
check('email: resend without its settings throws', outcome(() => getEmailProvider({ EMAIL_PROVIDER: 'resend' })) === 'THROWS');
check('email: resend with its settings', outcome(() => getEmailProvider({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.test' })) === 'resend');
{
  const r = await getEmailProvider(PROD).send({ to: 'x@y.test', subject: 's', text: 't' });
  check('email: the disabled provider reports not sent, never ok', r.ok === false && r.provider === 'none');
}
{
  const r = await getEmailProvider({}).send({ to: 'x@y.test', subject: 's', text: 't' });
  check('email: the dev fixture is the only one that answers ok without sending', r.ok === true && r.provider === 'mock');
}

// ── AI ───────────────────────────────────────────────────────────────────────
check('ai: dev default is the fixture', outcome(() => getAIAssessorProvider({})) === 'mock');
check('ai: production with nothing set refuses the fixture', outcome(() => getAIAssessorProvider(PROD)) === 'FORBIDDEN');
check('ai: production with braino configured', outcome(() => getAIAssessorProvider({ ...PROD, AI_ASSESSOR_PROVIDER: 'braino', ...BRAINO })) === 'braino');

// ── what the status page says ────────────────────────────────────────────────
const status = (env: Record<string, string>) => {
  const m = new Map(readProviderStatus(env).map((s) => [s.surface, s]));
  return (surface: 'sanctions' | 'wallet' | 'email' | 'ai') => m.get(surface)!;
};
{
  const s = status(PROD);
  check('status, production untouched: sanctions live', s('sanctions').state === 'live' && s('sanctions').selected === 'ofac-list');
  check('status, production untouched: wallet screening live', s('wallet').state === 'live');
  check('status, production untouched: e-mail idle, not mock', s('email').state === 'idle' && s('email').selected === 'none');
  check('status, production untouched: AI idle, not mock', s('ai').state === 'idle' && s('ai').selected === 'none');
  check('status, production untouched: nothing reports a fixture', readProviderStatus(PROD).every((x) => x.state !== 'dev-fixture' && x.selected !== 'mock'));
  check('status: every surface says what it does', readProviderStatus(PROD).every((x) => x.detail.length > 10));
}
{
  const s = status({ ...PROD, AI_ASSESSOR_PROVIDER: 'braino' });
  check('status: braino selected without its settings is misconfigured', s('ai').state === 'misconfigured');
  const t = status({ ...PROD, AI_ASSESSOR_PROVIDER: 'braino', ...BRAINO });
  check('status: braino with its settings is live', t('ai').state === 'live');
  const u = status({ ...PROD, EMAIL_PROVIDER: 'mock', SANCTIONS_PROVIDER: 'mock', AI_ASSESSOR_PROVIDER: 'mock', WALLET_SCREENING_PROVIDER: 'mock' });
  check('status: an explicit mock on production is flagged misconfigured on every surface', (['sanctions', 'wallet', 'email', 'ai'] as const).every((k) => u(k).state === 'misconfigured'));
  const v = status({ ...PROD, EMAIL_PROVIDER: 'resend' });
  check('status: resend without settings is misconfigured', v('email').state === 'misconfigured');
  const w = status({ ...PROD, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.test' });
  check('status: resend with settings is live', w('email').state === 'live');
}
{
  const s = status({});
  check('status, local/CI: fixtures are labelled dev-fixture', s('sanctions').state === 'dev-fixture' && s('email').state === 'dev-fixture' && s('wallet').state === 'dev-fixture');
  check('status: an unknown provider name is misconfigured', status({ SANCTIONS_PROVIDER: 'oops' })('sanctions').state === 'misconfigured');
  check('status agrees with the factory on every selection',
    (['mock', 'ofac-list', 'oops'] as const).every((name) => {
      const env = { SANCTIONS_PROVIDER: name };
      const built = outcome(() => getSanctionsProvider(env));
      return (built === 'THROWS') === (status(env)('sanctions').state === 'misconfigured');
    }));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
