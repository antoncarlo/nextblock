/**
 * AI assessor smoke checks (Pilot Readiness gap #5).
 *
 *   node --experimental-strip-types app/scripts/ai-assessor-smoke.ts
 *
 * Scope: deterministic mock scoring + sourceHash determinism. No network.
 */

import {
  MockAIAssessor,
  MockProviderForbiddenError,
  canonicalAssessmentBytes,
  getAIAssessorProvider,
  toContractRecommendation,
  CONTRACT_RECOMMENDATION,
} from '../src/lib/ai-assessor/provider.ts';
import { BrainoError } from '../src/lib/braino/client.ts';
import { keccak256, toHex } from 'viem';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const mock = new MockAIAssessor();

// Vanilla claim → APPROVE
{
  const a = await mock.assess({ claimId: 1n, requestedAmount: 1_000_000n, description: 'standard motor claim' });
  check('mock vanilla: APPROVE (0)', a.recommendation === 0);
  check('mock vanilla: recommendedAmount = requested', a.recommendedAmount === 1_000_000n);
  check('mock vanilla: anomaly low', a.anomalyScoreBps <= 3000);
  check('mock vanilla: sourceHash 0x + 64 hex', /^0x[0-9a-f]{64}$/.test(a.sourceHash));
}

// __ANOMALY__ → still APPROVE? No: anomaly>6000 forces REJECT (2)
{
  const a = await mock.assess({
    claimId: 2n,
    requestedAmount: 5_000_000n,
    description: 'incident report __ANOMALY__',
  });
  check('mock anomaly: REJECT (2)', a.recommendation === 2);
  check('mock anomaly: recommendedAmount = 0', a.recommendedAmount === 0n);
  check('mock anomaly: anomaly high', a.anomalyScoreBps >= 6000);
}

// __REVIEW__ → REVIEW (1), 70% recommended
{
  const a = await mock.assess({
    claimId: 3n,
    requestedAmount: 10_000_000n,
    description: '__REVIEW__ borderline',
  });
  check('mock review: REVIEW (1)', a.recommendation === 1);
  check('mock review: recommendedAmount = 70% requested', a.recommendedAmount === 7_000_000n);
}

// __REJECT__ → REJECT (2)
{
  const a = await mock.assess({ claimId: 4n, requestedAmount: 1n, description: '__REJECT__ fraudulent' });
  check('mock reject magic: REJECT (2)', a.recommendation === 2);
}

// Determinism: same input → same hash AND same draft.
{
  const a = await mock.assess({ claimId: 7n, requestedAmount: 1_000n, description: 'foo' });
  const b = await mock.assess({ claimId: 7n, requestedAmount: 1_000n, description: 'foo' });
  check('mock: deterministic sourceHash', a.sourceHash === b.sourceHash);
  check('mock: deterministic scores', a.scoreBps === b.scoreBps && a.anomalyScoreBps === b.anomalyScoreBps);
}

// Different inputs → different hashes.
{
  const a = await mock.assess({ claimId: 100n, requestedAmount: 1n, description: 'a' });
  const b = await mock.assess({ claimId: 100n, requestedAmount: 1n, description: 'b' });
  check('mock: description changes hash', a.sourceHash !== b.sourceHash);
  const c = await mock.assess({ claimId: 101n, requestedAmount: 1n, description: 'a' });
  check('mock: claimId changes hash', a.sourceHash !== c.sourceHash);
}

// canonicalAssessmentBytes is the keccak input — exposed for replay verification.
{
  const bytes = canonicalAssessmentBytes({
    claimId: 42n,
    requestedAmount: 1_000_000n,
    description: 'x',
    provider: 'mock',
  });
  const hash = keccak256(toHex(bytes));
  const a = await mock.assess({ claimId: 42n, requestedAmount: 1_000_000n, description: 'x' });
  check('canonical bytes → published hash match', hash === a.sourceHash);
}

// Score bounds: every output stays in [0, 10000]
{
  const inputs = [
    { claimId: 1n, requestedAmount: 1n, description: '' },
    { claimId: 1n, requestedAmount: 1n, description: '__ANOMALY__' },
    { claimId: 1n, requestedAmount: 1n, description: '__REVIEW__' },
    { claimId: 1n, requestedAmount: 1n, description: '__REJECT__' },
  ];
  let bounded = true;
  for (const inp of inputs) {
    const a = await mock.assess(inp);
    if (a.scoreBps < 0 || a.scoreBps > 10000) bounded = false;
    if (a.anomalyScoreBps < 0 || a.anomalyScoreBps > 10000) bounded = false;
    if (a.confidenceBps < 0 || a.confidenceBps > 10000) bounded = false;
  }
  check('mock: all scores in [0, 10000]', bounded);
}

// Draft encoding -> on-chain encoding. The contract is 0 MANUAL_REVIEW, 1 APPROVE, 2 REJECT;
// the draft is 0 APPROVE, 1 REVIEW, 2 REJECT. Passing a draft straight through would
// publish an approval as a manual review and a review as an approval.
{
  check('contract enum: MANUAL_REVIEW=0 APPROVE=1 REJECT=2',
    CONTRACT_RECOMMENDATION.MANUAL_REVIEW === 0 && CONTRACT_RECOMMENDATION.APPROVE === 1 && CONTRACT_RECOMMENDATION.REJECT === 2);
  check('draft APPROVE (0) -> contract APPROVE (1)', toContractRecommendation(0) === 1);
  check('draft REVIEW (1) -> contract MANUAL_REVIEW (0)', toContractRecommendation(1) === 0);
  check('draft REJECT (2) -> contract REJECT (2)', toContractRecommendation(2) === 2);
  const a = await mock.assess({ claimId: 9n, requestedAmount: 1_000n, description: 'ordinary' });
  check('mock approval is published as an on-chain APPROVE', toContractRecommendation(a.recommendation) === CONTRACT_RECOMMENDATION.APPROVE);
}

// Provider selection. The mock is for CI and development; production refuses it.
{
  check('dev default is the mock', getAIAssessorProvider({}).name === 'mock');
  let forbidden = false;
  try {
    getAIAssessorProvider({ VERCEL_ENV: 'production' });
  } catch (e) {
    forbidden = e instanceof MockProviderForbiddenError;
  }
  check('production with no provider set refuses the mock', forbidden);
  forbidden = false;
  try {
    getAIAssessorProvider({ VERCEL_ENV: 'production', AI_ASSESSOR_PROVIDER: 'mock' });
  } catch (e) {
    forbidden = e instanceof MockProviderForbiddenError;
  }
  check('production with the mock selected explicitly refuses it', forbidden);

  let code = '';
  try {
    getAIAssessorProvider({ AI_ASSESSOR_PROVIDER: 'braino' });
  } catch (e) {
    code = e instanceof BrainoError ? e.code : 'other';
  }
  check('braino without its config fails loud (not_configured)', code === 'not_configured');

  const ok = getAIAssessorProvider({
    AI_ASSESSOR_PROVIDER: 'braino',
    BRAINO_BASE_URL: 'https://api.example.test',
    BRAINO_HMAC_SECRET: 's3cret',
    VERCEL_ENV: 'production',
  });
  check('braino with its config is selected, also on production', ok.name === 'braino');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
