import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/LegalPage';

/** Live rendering of docs/PRIVACY.md — keep the two in sync. */

export const metadata: Metadata = {
  title: 'Privacy Policy | NextBlock',
  description: 'What personal data NextBlock collects, why, where it lives, how long it is kept and how to have it removed.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-07-04"
      anchorFirstSection="cookies"
      intro={[
        'This policy describes what personal data the NextBlock application collects, why, where it lives, how long it is kept and how to have it removed. It is written to be accurate to the implemented system, not aspirational. It applies to the Base Sepolia staging deployment and is subject to review by qualified counsel before any mainnet release.',
      ]}
      sections={[
        {
          heading: '1. Data we collect',
          body: [
            '• Wallet address (public by nature) — on connection and in any KYB application, for protocol identity: on-chain role checks, whitelist checks, application records.',
            '• KYB company data (company name, legal entity type, jurisdiction, license number, declared portfolio figure, website, description) — when you submit a KYB application, for institutional onboarding review (KYB / KYC / AML screening).',
            '• KYB contact data (contact name, contact email) — for reaching the applicant during review.',
            '• Review audit trail (reviewer wallet address, status transitions, notes) — accountability of compliance decisions (append-only record).',
            '• Visit data (IP address, coarse geolocation from CDN headers — country/city/region, referrer, user agent, page path) — on each page load, for first-party, self-hosted usage analytics.',
            '• Behavioral events (clicks on interface elements, time spent on page sections, scroll depth) — keyed to a random session id, never to a name; used to understand which parts of the product are used. No advertising, no cross-site profiling.',
          ],
        },
        {
          heading: '2. Cookies and analytics',
          body: [
            'We run a first-party, self-hosted analytics system: no Google Analytics, no advertising or third-party trackers, no fingerprinting.',
            'It uses a single httpOnly cookie, nb_sid: a random session identifier with a rolling 30-minute lifetime, used only to group the page views and interactions of the same visit. It contains no personal data and is not readable by page scripts.',
            'Analytics data is stored solely in our own database, is visible only to the operator on a password-protected internal dashboard, and is never shared or sold. In addition, Vercel Web Analytics (a service of our hosting processor, Vercel) collects aggregated, cookie-less visit statistics on its own dashboard. Wallet-connection libraries may set their own strictly functional storage.',
            'Server logs are structured and deliberately PII-free (route name, error kind and code only).',
          ],
        },
        {
          heading: '3. On-chain data',
          body: [
            'No personally identifiable information is written on-chain by the platform. On-chain records consist of wallet addresses, role assignments, whitelist flags and protocol accounting. Public blockchain data (addresses, transactions) is public and permanent by nature and is outside the scope of this policy; do not reuse a wallet you consider linkable to your identity if that linkage concerns you.',
          ],
        },
        {
          heading: '4. Where the data lives (processors)',
          body: [
            'KYB and analytics data is stored in a Supabase (PostgreSQL) project acting as data processor, in tables protected by deny-by-default row-level security: browser clients can neither read nor write them in any direction. Access flows exclusively through the application server routes, which authenticate operators by wallet signature verified against on-chain roles.',
            'The public status endpoint returns application status and timestamps only — never company or contact data. Hosting of the application layer is provided by Vercel.',
          ],
        },
        {
          heading: '5. Retention',
          body: [
            'KYB applications and their audit trail are kept until the application reaches a terminal status (approved or rejected, including applicant-requested withdrawal) plus 90 days, after which they are eligible for deletion.',
            'Analytics visit and event records are retained for at most 13 months and then deleted by an automated monthly job; ephemeral operational rows (rate-limit windows, one-time operator nonces) are purged within days.',
            'Independently of these schedules, the staging database may be wiped at any time as part of staging resets.',
          ],
        },
        {
          heading: '6. Deletion and access requests',
          body: [
            'To request access to, correction of, or deletion of your data, contact the operations contact documented in the public repository (docs/OPERATIONS.md, SECURITY.md), writing from the contact email used in the application or signing a message with the applicant wallet to prove control. Requests are honored within 30 days. Deletion removes the database record; it cannot remove anything that exists on a public blockchain.',
          ],
        },
        {
          heading: '7. Sharing',
          body: [
            'Data is not sold. It is not shared with any third party except: Supabase as storage processor and Vercel as hosting processor (each bound by their own data processing terms), and disclosures strictly required by applicable law or lawful order.',
            'Partner entities involved in reinsurance arrangements do not receive applicant PII through the platform; any such exchange would occur off-platform under separate agreements.',
          ],
        },
        {
          heading: '8. Security measures',
          body: [
            'Deny-by-default row-level security on every data table; a server-only service-role credential that never reaches client code or public configuration; fail-closed API behavior when configuration is missing; operator actions bound to single-use server nonces inside signed messages; IP rate limiting on submission and review endpoints; append-only audit trail of review decisions.',
          ],
        },
        {
          heading: '9. Changes',
          body: [
            'Material changes to this policy will be reflected on this page and in the repository document with a new date before they take effect.',
          ],
        },
      ]}
    />
  );
}
