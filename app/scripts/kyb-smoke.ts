/**
 * KYB schema smoke checks.
 *
 * Runs with the Node 22 TypeScript strip-types loader so no test framework or
 * new dependency is required:
 *
 *   node --experimental-strip-types app/scripts/kyb-smoke.ts
 *
 * Scope: payload validation and review-status transition rules. The wallet
 * signature verification path is intentionally NOT exercised here so that no
 * key material of any kind exists in the repository; it is covered by
 * typechecking and integration review.
 */

import {
  kybApplicationPayloadSchema,
  kybReviewRequestSchema,
  isValidTransition,
  KYB_STATUSES,
  operatorAuthMessage,
  isTimestampWithinWindow,
} from '../src/lib/kyb/schema.ts';

let failures = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const validPayload = {
  applicantType: 'cedant',
  walletAddress: '0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870',
  companyName: 'Example Re S.A.',
  legalEntityType: 'S.A.',
  jurisdiction: 'Luxembourg',
  licenseNumber: 'LU-12345',
  declaredPortfolio: '10M USD ceded premium',
  contactName: 'Jane Doe',
  contactEmail: 'jane@example.com',
  website: 'https://example.com',
  description: 'Licensed reinsurer applying as cedant.',
  chainId: 84532,
};

check('payload valido accettato', kybApplicationPayloadSchema.safeParse(validPayload).success);
check(
  'wallet malformato rifiutato',
  !kybApplicationPayloadSchema.safeParse({ ...validPayload, walletAddress: 'not-an-address' }).success,
);
check(
  'email invalida rifiutata',
  !kybApplicationPayloadSchema.safeParse({ ...validPayload, contactEmail: 'nope' }).success,
);
check(
  'applicantType sconosciuto rifiutato',
  !kybApplicationPayloadSchema.safeParse({ ...validPayload, applicantType: 'degen' }).success,
);
check(
  'chainId non-84532 rifiutato (Base-only)',
  !kybApplicationPayloadSchema.safeParse({ ...validPayload, chainId: 1 }).success,
);
check(
  'companyName vuoto rifiutato',
  !kybApplicationPayloadSchema.safeParse({ ...validPayload, companyName: '' }).success,
);

check('stati attesi presenti', JSON.stringify([...KYB_STATUSES]) === JSON.stringify([
  'submitted', 'under_review', 'approved', 'rejected', 'needs_info',
]));

check('submitted -> under_review valida', isValidTransition('submitted', 'under_review'));
check('under_review -> approved valida', isValidTransition('under_review', 'approved'));
check('under_review -> needs_info valida', isValidTransition('under_review', 'needs_info'));
check('needs_info -> under_review valida', isValidTransition('needs_info', 'under_review'));
check('submitted -> approved NON valida (serve review)', !isValidTransition('submitted', 'approved'));
check('approved terminale', !isValidTransition('approved', 'under_review'));
check('rejected terminale', !isValidTransition('rejected', 'under_review'));
check('transizione identica NON valida', !isValidTransition('submitted', 'submitted'));

const msg = operatorAuthMessage('list', 1781200000);
check('messaggio auth contiene azione e timestamp', msg.includes('list') && msg.includes('1781200000'));
const reviewMsg = operatorAuthMessage('review:123:approved', 1781200000, 'abcdef1234567890');
check('messaggio review lega il nonce alla firma', reviewMsg.includes('nonce: abcdef1234567890'));
check('messaggio list senza nonce resta compatibile', !msg.includes('nonce:'));

const validReview = {
  toStatus: 'approved',
  note: 'Review completed.',
  auth: {
    address: '0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870',
    timestamp: 1781200000,
    nonce: 'abcdef1234567890',
    signature: '0x' + 'a'.repeat(130),
  },
};
check('review request valido accettato', kybReviewRequestSchema.safeParse(validReview).success);
check(
  'review request senza nonce rifiutato',
  !kybReviewRequestSchema.safeParse({ ...validReview, auth: { ...validReview.auth, nonce: undefined } }).success,
);
check(
  'review request con nonce non esadecimale rifiutato',
  !kybReviewRequestSchema.safeParse({ ...validReview, auth: { ...validReview.auth, nonce: 'not-a-nonce' } }).success,
);
check('timestamp dentro finestra accettato', isTimestampWithinWindow(1000, 1100, 300));
check('timestamp scaduto rifiutato', !isTimestampWithinWindow(1000, 1500, 300));
check('timestamp futuro oltre skew rifiutato', !isTimestampWithinWindow(1500, 1000, 300));

if (failures > 0) {
  console.error(`\n${failures} CHECK FALLITI`);
  process.exit(1);
}
console.log('\nTUTTI I CHECK KYB PASSATI');
