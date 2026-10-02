/**
 * What each pluggable surface is doing right now, derived from the environment the same
 * way the factories derive it. Pure, so the admin status page, the cron routes and the
 * smoke tests agree on one answer.
 *
 *   live            a real provider is active
 *   idle            production, nothing configured: the surface does nothing and says so
 *   dev-fixture     a mock outside production (a developer machine, CI, a preview)
 *   misconfigured   a real provider is selected without what it needs, or a mock is
 *                   selected on production (the factory refuses it)
 */

import { brainoConfigFromEnv } from '../braino/client.ts';
import { isProduction, type Env } from './production.ts';

export type SurfaceState = 'live' | 'idle' | 'dev-fixture' | 'misconfigured';

export interface SurfaceStatus {
  surface: 'sanctions' | 'wallet' | 'email' | 'ai';
  selected: string;
  state: SurfaceState;
  detail: string;
  requiredVars: Array<{ name: string; present: boolean }>;
}

const present = (v: string | undefined) => typeof v === 'string' && v.length > 0;
const vars = (env: Env, names: string[]) => names.map((name) => ({ name, present: present(env[name]) }));

function mockOrUnknown(
  surface: SurfaceStatus['surface'],
  selected: string,
  explicit: boolean,
  production: boolean,
  known: string[],
): SurfaceStatus | null {
  if (selected === 'mock') {
    return production
      ? {
          surface,
          selected,
          state: 'misconfigured',
          detail: explicit ? 'the mock is selected on production and the factory refuses it' : 'no provider configured',
          requiredVars: [],
        }
      : { surface, selected, state: 'dev-fixture', detail: 'fixture for development and CI, not production', requiredVars: [] };
  }
  if (!known.includes(selected)) {
    return { surface, selected, state: 'misconfigured', detail: `"${selected}" is not a known provider`, requiredVars: [] };
  }
  return null;
}

export function readProviderStatus(env: Env): SurfaceStatus[] {
  const production = isProduction(env);
  const out: SurfaceStatus[] = [];

  // Sanctions (names)
  {
    const explicit = present(env.SANCTIONS_PROVIDER);
    const selected = (env.SANCTIONS_PROVIDER ?? (production ? 'ofac-list' : 'mock')).toLowerCase();
    const early = mockOrUnknown('sanctions', selected, explicit, production, ['ofac-list', 'complyadvantage']);
    if (early) out.push(early);
    else if (selected === 'ofac-list') {
      out.push({
        surface: 'sanctions',
        selected,
        state: 'live',
        detail: 'official OFAC SDN, OFAC consolidated and UN lists; names only, no EU/UK lists, PEP or adverse media',
        requiredVars: [],
      });
    } else {
      const ok = present(env.COMPLY_ADVANTAGE_API_KEY);
      out.push({
        surface: 'sanctions',
        selected,
        state: ok ? 'live' : 'misconfigured',
        detail: ok ? 'ComplyAdvantage' : 'COMPLY_ADVANTAGE_API_KEY is not set',
        requiredVars: vars(env, ['COMPLY_ADVANTAGE_API_KEY']),
      });
    }
  }

  // Wallet screening
  {
    const explicit = present(env.WALLET_SCREENING_PROVIDER);
    const selected = (env.WALLET_SCREENING_PROVIDER ?? (production ? 'chainalysis-oracle' : 'mock')).toLowerCase();
    const early = mockOrUnknown('wallet', selected, explicit, production, ['chainalysis-oracle']);
    out.push(
      early ?? {
        surface: 'wallet',
        selected,
        state: 'live',
        detail: 'Chainalysis public sanctions oracle on Base: sanctioned yes/no per address; no risk scoring',
        requiredVars: [],
      },
    );
  }

  // E-mail
  {
    const explicit = present(env.EMAIL_PROVIDER);
    const selected = (env.EMAIL_PROVIDER ?? (production ? 'none' : 'mock')).toLowerCase();
    const early = mockOrUnknown('email', selected, explicit, production, ['none', 'resend']);
    if (early) out.push(early);
    else if (selected === 'none') {
      out.push({ surface: 'email', selected, state: 'idle', detail: 'no e-mail is sent; in-app notifications are unaffected', requiredVars: [] });
    } else {
      const ok = present(env.RESEND_API_KEY) && present(env.EMAIL_FROM);
      out.push({
        surface: 'email',
        selected,
        state: ok ? 'live' : 'misconfigured',
        detail: ok ? 'Resend' : 'RESEND_API_KEY and EMAIL_FROM are both required',
        requiredVars: vars(env, ['RESEND_API_KEY', 'EMAIL_FROM']),
      });
    }
  }

  // AI claim assessment
  {
    const explicit = present(env.AI_ASSESSOR_PROVIDER);
    const selected = (env.AI_ASSESSOR_PROVIDER ?? (production ? 'none' : 'mock')).toLowerCase();
    if (selected === 'none' || (production && selected === 'mock' && !explicit)) {
      out.push({
        surface: 'ai',
        selected: 'none',
        state: 'idle',
        detail: 'no AI provider connected: no assessment is drafted',
        requiredVars: [],
      });
    } else {
      const early = mockOrUnknown('ai', selected, explicit, production, ['braino']);
      if (early) out.push(early);
      else {
        const cfg = brainoConfigFromEnv(env);
        out.push({
          surface: 'ai',
          selected,
          state: cfg.ok ? 'live' : 'misconfigured',
          detail: cfg.ok ? 'Braino.ai / WAVENURE' : cfg.problems.join('; '),
          requiredVars: vars(env, ['BRAINO_BASE_URL', 'BRAINO_HMAC_SECRET']),
        });
      }
    }
  }

  return out;
}
