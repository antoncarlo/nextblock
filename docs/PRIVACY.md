# NextBlock Privacy Policy (Staging)

Last updated: 2026-06-13

This policy describes what personal data the NextBlock staging application
collects, why, where it lives and how to have it removed.

## 1. Data we collect

| Data | When | Why |
|---|---|---|
| Wallet address | On connection and in any KYB application | Protocol identity: on-chain roles, whitelist checks, application records |
| KYB company data: company name, legal entity type, jurisdiction, license number, declared portfolio figure, website, free-text description | When you submit a KYB application | Institutional onboarding review (KYB/KYC) |
| KYB contact data: contact name, contact email | When you submit a KYB application | Reaching the applicant during review |
| Review audit trail: reviewer wallet address, status transitions, notes | When an operator reviews an application | Accountability of compliance decisions |

We do not use analytics trackers, advertising identifiers or cookies beyond
what the wallet connection libraries strictly require. Public on-chain data
(addresses, transactions) is outside the scope of this policy and is by
nature public and permanent.

## 2. Where the data lives

KYB data is stored in a Supabase (PostgreSQL) project acting as processor,
in tables protected by deny-by-default row-level security: browser clients
cannot read or write them; access flows only through the application's
server routes. The public status endpoint exposes application status and
timestamps only - never company or contact data.

## 3. Retention

KYB applications and their audit trail are kept until the application
reaches a terminal status (approved or rejected) plus 90 days, after which
they are eligible for deletion. The staging database may additionally be
wiped at any time as part of staging resets.

## 4. Deletion and access requests

To request access to or deletion of your KYB data, contact the operations
contact listed in `SECURITY.md` / `docs/OPERATIONS.md` of the public
repository (github.com/antoncarlo/nextblock) from the contact email used in
the application, or sign a message with the applicant wallet to prove
control. Deletion removes the database record; it cannot remove anything
you chose to put on-chain.

## 5. Sharing

KYB data is not sold and not shared with third parties, except the
infrastructure processors required to run the application (Supabase for
storage, Vercel for hosting) and where disclosure is legally required.

## 6. Changes

Material changes to this policy will be reflected in this document with a
new date before they take effect.
