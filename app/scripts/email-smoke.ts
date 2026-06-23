/**
 * Email provider + template smoke (Batch C).
 *
 *   node --experimental-strip-types app/scripts/email-smoke.ts
 *
 * Scope: deterministic mock + pure template rendering. No network.
 */

import { MockEmailProvider } from '../src/lib/email/provider.ts';
import { renderNotificationEmail } from '../src/lib/email/templates.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const mock = new MockEmailProvider();

// Mock send returns ok with provider id, never throws.
{
  const r = await mock.send({ to: 'a@b.test', subject: 's', text: 'hello' });
  check('mock send ok', r.ok === true);
  check('mock provider mock', r.provider === 'mock');
  check('mock returns id', typeof r.providerMessageId === 'string');
}

// Template: status_change.
{
  const e = renderNotificationEmail({
    claimId: 42,
    kind: 'status_change',
    message: 'Claim #42: Assessed → Approved',
    vault: '0xabcdef0000000000000000000000000000000001',
    appUrl: 'https://nextblock.finance/',
  });
  check('subject mentions claim', e.subject.includes('Claim #42'));
  check('text has message', e.text.includes('Approved'));
  check('text has vault', e.text.includes('0xabcdef00'));
  check('text has claims URL', e.text.includes('/app/claims'));
  check('text has prefs URL', e.text.includes('/app/me'));
  check('html has claims link', e.html.includes('/app/claims'));
  check('html escapes nothing dangerous in vanilla input', !e.html.includes('<script>'));
  check('appUrl trailing slash stripped', !e.html.includes('finance//app'));
}

// Template: evidence_uploaded.
{
  const e = renderNotificationEmail({
    claimId: 99,
    kind: 'evidence_uploaded',
    message: 'New evidence on claim #99',
    vault: '0x0000000000000000000000000000000000000bad',
    appUrl: 'https://nextblock.finance',
  });
  check('evidence subject', e.subject.includes('evidence'));
  check('evidence text mentions claim', e.text.includes('#99'));
}

// HTML escaping of user content.
{
  const e = renderNotificationEmail({
    claimId: 1,
    kind: 'status_change',
    message: 'Claim <script>alert(1)</script> & "ok"',
    vault: '0x' + 'a'.repeat(40),
    appUrl: 'https://nextblock.finance',
  });
  check('html escapes < / >', !e.html.includes('<script>alert'));
  check('html escapes ampersand', e.html.includes('&amp;'));
  check('html escapes double quote', e.html.includes('&quot;'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
