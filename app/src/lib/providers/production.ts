/**
 * One rule for every pluggable provider: on production only real providers run.
 *
 * A provider that fabricates an answer (a sanctions "clear", an AI assessment, a sent
 * e-mail) is acceptable in CI and on a developer machine, where nobody relies on the
 * answer. On production it is a false assurance, so the factories refuse it instead of
 * falling back to it. Where a real provider needs no account (sanctions lists, wallet
 * screening) it is the production default; where it does (AI, e-mail) the surface is
 * reported as idle until configured.
 *
 * Production means the Vercel production deployment. Preview deployments, CI and
 * local runs are not production.
 */

export type Env = Record<string, string | undefined>;

export function isProduction(env: Env): boolean {
  return env.VERCEL_ENV === 'production';
}

/** A mock provider was selected, or defaulted to, on production. */
export class MockProviderForbiddenError extends Error {
  readonly surface: string;
  constructor(surface: string) {
    super(`the ${surface} provider resolves to the mock on production`);
    this.name = 'MockProviderForbiddenError';
    this.surface = surface;
  }
}
