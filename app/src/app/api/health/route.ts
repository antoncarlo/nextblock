import { NextResponse } from 'next/server';
import { version } from '../../../../package.json';

/**
 * Liveness endpoint for uptime monitoring. Intentionally minimal: no
 * dependency probes, no secret presence disclosure, no PII. Returns 200
 * whenever the Next.js runtime can serve requests.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    chain: 'base-sepolia',
    version,
  });
}
