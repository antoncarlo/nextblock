import { NextRequest } from 'next/server';
import { getSupabaseAnonServerClient, getSupabaseServerClient } from '@/lib/supabase-server';

export const APP_ACCESS_ROLES = ['admin', 'kyb_operator', 'reviewer', 'support'] as const;
export type AppAccessRole = (typeof APP_ACCESS_ROLES)[number];

export interface EmailActor {
  method: 'email';
  userId: string;
  email: string;
  displayName: string | null;
  status: 'active';
  roles: AppAccessRole[];
  wallets: Array<{
    address: `0x${string}`;
    label: string | null;
    isPrimary: boolean;
  }>;
}

export type EmailActorResult =
  | { ok: true; actor: EmailActor }
  | { ok: false; status: 401 | 403 | 502 | 503; error: string };

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function bearerTokenFromRequest(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function normalizeRole(value: unknown): AppAccessRole | null {
  return APP_ACCESS_ROLES.includes(value as AppAccessRole) ? (value as AppAccessRole) : null;
}

function hasRequiredRole(roles: AppAccessRole[], requiredRoles: readonly AppAccessRole[]): boolean {
  if (requiredRoles.length === 0) return true;
  return requiredRoles.some(role => roles.includes(role));
}

export function canAccessKybQueue(roles: readonly AppAccessRole[]): boolean {
  return roles.includes('admin') || roles.includes('kyb_operator') || roles.includes('reviewer');
}

export function canReviewKyb(roles: readonly AppAccessRole[]): boolean {
  return roles.includes('admin') || roles.includes('kyb_operator') || roles.includes('reviewer');
}

export function canOperateProtocol(roles: readonly AppAccessRole[]): boolean {
  return roles.includes('admin') || roles.includes('kyb_operator');
}

export async function getEmailActorFromRequest(
  request: NextRequest,
  requiredRoles: readonly AppAccessRole[] = [],
): Promise<EmailActorResult> {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return { ok: false, status: 401, error: 'missing email session' };
  }

  const authClient = getSupabaseAnonServerClient();
  const serviceClient = getSupabaseServerClient();
  if (!authClient || !serviceClient) {
    return { ok: false, status: 503, error: 'email auth unavailable' };
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.id || !user.email) {
    return { ok: false, status: 401, error: 'invalid email session' };
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('app_users')
    .select('id,email,display_name,status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 502, error: 'email profile lookup failed' };
  }
  if (!profile) {
    return { ok: false, status: 403, error: 'email account is not authorized for this app' };
  }
  if (profile.status !== 'active') {
    return { ok: false, status: 403, error: 'email account is disabled' };
  }

  const { data: roleRows, error: rolesError } = await serviceClient
    .from('app_user_roles')
    .select('role')
    .eq('user_id', user.id);
  if (rolesError) {
    return { ok: false, status: 502, error: 'email role lookup failed' };
  }

  const roles = Array.from(
    new Set((roleRows ?? []).map(row => normalizeRole(row.role)).filter((role): role is AppAccessRole => Boolean(role))),
  );

  if (!hasRequiredRole(roles, requiredRoles)) {
    return { ok: false, status: 403, error: 'email account lacks required app role' };
  }

  const { data: walletRows, error: walletsError } = await serviceClient
    .from('app_user_wallets')
    .select('wallet_address,label,is_primary')
    .eq('user_id', user.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });
  if (walletsError) {
    return { ok: false, status: 502, error: 'email wallet lookup failed' };
  }

  const wallets = (walletRows ?? [])
    .filter(row => typeof row.wallet_address === 'string' && EVM_ADDRESS_RE.test(row.wallet_address))
    .map(row => ({
      address: row.wallet_address as `0x${string}`,
      label: typeof row.label === 'string' ? row.label : null,
      isPrimary: Boolean(row.is_primary),
    }));

  return {
    ok: true,
    actor: {
      method: 'email',
      userId: user.id,
      email: profile.email || user.email,
      displayName: typeof profile.display_name === 'string' ? profile.display_name : null,
      status: 'active',
      roles,
      wallets,
    },
  };
}
