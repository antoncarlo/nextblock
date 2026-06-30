/**
 * Email provider — pluggable adapter (Batch C — notifications email channel).
 *
 * MVP ships with:
 *   - `MockEmailProvider` — logs to console with a structured envelope. Default
 *      in dev/CI/pilot until an email provider account exists. Never throws,
 *      so the notification pipeline stays unblocked.
 *   - `ResendEmailProvider` — production client against api.resend.com.
 *      Requires `RESEND_API_KEY`. Fail-loud on network/HTTP error (returns
 *      `{ ok: false, reason }` — caller decides whether to swallow or escalate).
 *
 * Selection: `EMAIL_PROVIDER=resend|mock` (default `mock`).
 *
 * Templates are kept in `templates.ts` next to the provider so adding a new
 * notification kind is a single-file change.
 */

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
  provider: 'mock' | 'resend';
  /** Provider-returned message id when available. */
  providerMessageId?: string;
  reason?: string;
}

export interface EmailProvider {
  readonly name: 'mock' | 'resend';
  send(msg: EmailMessage): Promise<EmailSendResult>;
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
 * - `EMAIL_PROVIDER` unset or 'mock' → MockEmailProvider
 * - 'resend' + `RESEND_API_KEY` + `EMAIL_FROM` → ResendEmailProvider
 * - 'resend' missing key/from → throws; caller surfaces 503
 */
export function getEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const selected = (env.EMAIL_PROVIDER ?? 'mock').toLowerCase();
  if (selected === 'resend') {
    const key = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    if (!key) throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set');
    if (!from) throw new Error('EMAIL_PROVIDER=resend but EMAIL_FROM is not set');
    return new ResendEmailProvider(key, from);
  }
  return new MockEmailProvider();
}
