/**
 * Recommendation encodings, kept free of imports so the browser can use them.
 *
 * The draft encoding (this module's `Recommendation`) is what the backend and the
 * `ai_assessments_pending` table use: 0 = APPROVE, 1 = REVIEW, 2 = REJECT.
 *
 * `AIAssessor.Recommendation` on-chain is different: 0 = MANUAL_REVIEW, 1 = APPROVE,
 * 2 = REJECT. A draft must pass through `toContractRecommendation` before it reaches
 * `publishAssessment`; passing it straight would publish an approval as a manual
 * review and a review as an approval.
 */

export type Recommendation = 0 | 1 | 2;

/** `AIAssessor.Recommendation` as the contract defines it. */
export const CONTRACT_RECOMMENDATION = { MANUAL_REVIEW: 0, APPROVE: 1, REJECT: 2 } as const;

/** Draft encoding -> the value `publishAssessment` expects. */
export function toContractRecommendation(draft: Recommendation): 0 | 1 | 2 {
  if (draft === 0) return CONTRACT_RECOMMENDATION.APPROVE;
  if (draft === 1) return CONTRACT_RECOMMENDATION.MANUAL_REVIEW;
  return CONTRACT_RECOMMENDATION.REJECT;
}
