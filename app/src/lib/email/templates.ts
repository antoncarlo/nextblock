/**
 * Email templates for notification kinds (Batch C).
 *
 * Pure: no provider, no React. Each builder takes the structured event and
 * returns subject + text + html. HTML is intentionally minimal — institutional
 * recipients open these in conservative clients; we lead with the plain text.
 */

import type { NotificationKind } from '@/lib/notifications/derive';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface NotificationEmailInput {
  claimId: number;
  kind: NotificationKind;
  message: string;
  vault: string;
  appUrl: string;
}

const FOOTER_TEXT = '\n\n—\nNextBlock notifications.\nManage your preferences: ';
const FOOTER_HTML = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
  <p style="font-size:12px;color:#6b7280;">
    NextBlock notifications. <a href="{{prefsUrl}}" style="color:#5b21b6;">Manage your preferences</a>.
  </p>
`;

function safeUrl(appUrl: string, path: string): string {
  // Trim trailing slash, append path verbatim. No interpolation of recipient
  // data into the URL — the claim id is numeric on-chain so it's safe.
  const base = appUrl.replace(/\/+$/, '');
  return `${base}${path}`;
}

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const claimsUrl = safeUrl(input.appUrl, '/app/claims');
  const prefsUrl = safeUrl(input.appUrl, '/app/me');

  const subject =
    input.kind === 'status_change'
      ? `NextBlock: Claim #${input.claimId} update`
      : input.kind === 'evidence_uploaded'
        ? `NextBlock: New evidence on claim #${input.claimId}`
        : `NextBlock: Claim #${input.claimId}`;

  const text =
    `${input.message}\n\n` +
    `Vault: ${input.vault}\n` +
    `Review on the Claims Control Room: ${claimsUrl}` +
    FOOTER_TEXT +
    prefsUrl;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;">` +
    `<p style="font-size:14px;line-height:1.5;">${escapeHtml(input.message)}</p>` +
    `<p style="font-size:12px;color:#6b7280;">Vault: <code style="font-family:Menlo,monospace;">${escapeHtml(input.vault)}</code></p>` +
    `<p style="font-size:14px;"><a href="${escapeAttr(claimsUrl)}" style="color:#5b21b6;font-weight:500;">Open Claims Control Room →</a></p>` +
    FOOTER_HTML.replaceAll('{{prefsUrl}}', escapeAttr(prefsUrl)) +
    `</div>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(s: string): string {
  // URL-safe enough for href/src; the inputs are already controlled (appUrl
  // env + numeric claim id), but defensive anyway.
  return s.replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
