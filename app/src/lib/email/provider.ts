/**
 * Email provider — pluggable adapter (Batch C — notifications email channel).
 *
 *   - `ResendEmailProvider` — client against api.resend.com. Requires
 *      `RESEND_API_KEY` and `EMAIL_FROM`. Fail-loud on network/HTTP error (returns
 *      `{ ok: false, reason }` — caller decides whether to swallow or escalate).
 *   - `DisabledEmailProvider` — what production runs until Resend is configured.
 *      It sends nothing and says so (`ok: false`, provider `none`), so no caller can
 *      take a message that never left for one that did. The in-app notification is the
 *      source of truth; e-mail is best-effort on top.
 *   - `MockEmailProvider` — logs to console. Dev/CI only; REFUSED on production.
 *
 * Selection: `EMAIL_PROVIDER=resend|mock`. Outside production the default is `mock`;
 * on production an unset value means `none` and `mock` is refused.
 *
 * Templates are kept in `templates.ts` next to the provider so adding a new
 * notification kind is a single-file change.
 */

import { isProduction, MockProviderForbiddenError, type Env } from '../providers/production.ts';

export interface EmailMessage {
  to: string;
  /** Plain-text subject. */
  subject: string;
  /** Plain-text body — the safe fallback. */
  text: string;
  /** Optional HTML body for richer clients. */
  html?: string;
  /** Optional reply-to override (default: NextBlock noreply). */
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  provider: 'mock' | 'resend' | 'none';
  /** Provider-returned message id when available. */
  providerMessageId?: string;
  reason?: string;
}

export interface EmailProvider {
  readonly name: 'mock' | 'resend' | 'none';
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

export class DisabledEmailProvider implements EmailProvider {
  readonly name = 'none' as const;

  async send(): Promise<EmailSendResult> {
    return { ok: false, provider: 'none', reason: 'e-mail is not configured (set EMAIL_PROVIDER=resend)' };
  }
}

export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock' as const;

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    // PII-light log so pilot ops can confirm the pipeline fired without
    // dumping the entire body into platform logs.
    console.log(
      JSON.stringify({
        level: 'info',
        provider: 'mock-email',
        to: msg.to,
        subject: msg.subject,
        at: new Date().toISOString(),
      }),
    );
    return {
      ok: true,
      provider: 'mock',
      providerMessageId: `mock-${Date.now()}`,
    };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly apiKey: string;
  private readonly from: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, from: string, baseUrl = 'https://api.resend.com') {
    if (!apiKey) throw new Error('ResendEmailProvider: missing apiKey');
    if (!from) throw new Error('ResendEmailProvider: missing from address');
    this.apiKey = apiKey;
    this.from = from;
    this.baseUrl = baseUrl;
  }

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          reply_to: msg.replyTo,
        }),
      });
    } catch (err) {
      return {
        ok: false,
        provider: 'resend',
        reason: err instanceof Error ? err.message.slice(0, 200) : 'network',
      };
    }
    if (!res.ok) {
      return { ok: false, provider: 'resend', reason: `http ${res.status}` };
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      // Resend usually returns JSON, but accept a 2xx without body as success.
      return { ok: true, provider: 'resend' };
    }
    const id = (payload as { id?: string }).id;
    return { ok: true, provider: 'resend', providerMessageId: id };
  }
}

/**
 * Provider factory — env-driven, fail-loud on misconfiguration.
 *
 * - 'resend' + `RESEND_API_KEY` + `EMAIL_FROM` → ResendEmailProvider
 * - 'resend' missing key/from → throws; caller surfaces 503
 * - production: unset → DisabledEmailProvider; 'mock' → MockProviderForbiddenError
 * - elsewhere: unset or 'mock' → MockEmailProvider
 */
export function getEmailProvider(env: Env = process.env): EmailProvider {
  const production = isProduction(env);
  const selected = (env.EMAIL_PROVIDER ?? (production ? 'none' : 'mock')).toLowerCase();
  if (selected === 'resend') {
    const key = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    if (!key) throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set');
    if (!from) throw new Error('EMAIL_PROVIDER=resend but EMAIL_FROM is not set');
    return new ResendEmailProvider(key, from);
  }
  if (selected === 'none') return new DisabledEmailProvider();
  if (selected === 'mock') {
    if (production) throw new MockProviderForbiddenError('email');
    return new MockEmailProvider();
  }
  throw new Error(`EMAIL_PROVIDER="${selected}" is not a known provider`);
}
