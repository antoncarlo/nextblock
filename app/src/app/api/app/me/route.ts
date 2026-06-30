import { NextRequest, NextResponse } from 'next/server';
import { getEmailActorFromRequest } from '@/lib/app-auth/session';

export async function GET(request: NextRequest) {
  const actor = await getEmailActorFromRequest(request);
  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  return NextResponse.json({
    user: {
      id: actor.actor.userId,
      email: actor.actor.email,
      displayName: actor.actor.displayName,
    },
    roles: actor.actor.roles,
    wallets: actor.actor.wallets,
  });
}
