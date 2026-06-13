# NextBlock Privacy Policy

Last updated: 2026-06-13
Status: applies to the Base Sepolia STAGING deployment. Subject to review
by qualified counsel before any mainnet release.

This policy describes what personal data the NextBlock application
collects, why, where it lives, how long it is kept and how to have it
removed. It is written to be accurate to the implemented system, not
aspirational.

## 1. Data we collect

| Data | When | Why |
|---|---|---|
| Wallet address (public by nature) | On connection and in any KYB application | Protocol identity: on-chain role checks, whitelist checks, application records |
| KYB company data: company name, legal entity type, jurisdiction, license number, declared portfolio figure, website, free-text description | When you submit a KYB application | Institutional onboarding review (KYB / KYC / AML screening) |
| KYB contact data: contact name, contact email | When you submit a KYB application | Reaching the applicant during review |
| Review audit trail: reviewer wallet address, status transitions, review notes | When an operator reviews an application | Accountability of compliance decisions (append-only record) |

We do not use analytics trackers, advertising identifiers, fingerprinting
or cookies beyond what the wallet-connection libraries strictly require.
Server logs are structured and deliberately PII-free (route name, error
kind and code only).

## 2. On-chain data

No personally identifiable information is written on-chain by the
platform. On-chain records consist of wallet addresses, role assignments,
whitelist flags and protocol accounting. Public blockchain data
(addresses, transactions) is public and permanent by nature and is outside
the scope of this policy; do not reuse a wallet you consider linkable to
your identity if that linkage concerns you.

## 3. Where the data lives (processor)

KYB data is stored in a Supabase (PostgreSQL) project acting as data
processor (project reference `krycyeiwsplztagajauh`), in tables protected
by deny-by-default row-level security: browser clients can neither read
nor write them in any direction. Access flows exclusively through the
application's server routes, which authenticate operators by wallet
signature verified against on-chain roles. The public status endpoint
returns application status and timestamps only - never company or contact
data. Hosting of the application layer is provided by Vercel.

## 4. Retention

KYB applications and their audit trail are kept until the application
reaches a terminal status - approved or rejected, including
applicant-requested withdrawal (recorded as a rejection in the current
state machine) - plus 90 days, after which they are eligible for deletion.
Independently of this schedule, the staging database may be wiped at any
time as part of staging resets.

## 5. Deletion and access requests

To request access to, correction of, or deletion of your KYB data, contact
the operations contact documented in `docs/OPERATIONS.md` (see also
`SECURITY.md`) of the public repository, writing from the contact email
used in the application or signing a message with the applicant wallet to
prove control. Requests are honored within 30 days. Deletion removes the
database record; it cannot remove anything that exists on a public
blockchain.

## 6. Sharing

KYB data is not sold. It is not shared with any third party except:
Supabase as storage processor and Vercel as hosting processor (each bound
by their own data processing terms), and disclosures strictly required by
applicable law or lawful order. Partner entities involved in reinsurance
arrangements (see `docs/LEGAL.md`) do not receive applicant PII through
the platform; any such exchange would occur off-platform under separate
agreements.

## 7. Security measures

Deny-by-default row-level security on every KYB table; a server-only
service-role credential that never reaches client code or public
configuration; fail-closed API behavior when configuration is missing;
operator actions bound to single-use server nonces inside signed messages;
IP rate limiting on submission and review endpoints; append-only audit
trail of review decisions.

## 8. Changes

Material changes to this policy will be reflected in this document with a
new date before they take effect.
