// AIAssessor mappings: immutable assessment records. The assessor is
// advisory by contract design (it can never approve or pay); the series
// exists so committee decisions can be audited against the advice they had.

import { AssessmentPublished } from "../generated/AIAssessor/AIAssessor";
import { Assessment } from "../generated/schema";
import { eventId, logEvent, LogParams } from "./helpers";

export function handleAssessmentPublished(event: AssessmentPublished): void {
  const a = new Assessment(eventId(event));
  a.claimId = event.params.claimId;
  a.scoreBps = event.params.scoreBps;
  a.anomalyScoreBps = event.params.anomalyScoreBps;
  a.confidenceBps = event.params.confidenceBps;
  a.recommendation = event.params.recommendation;
  a.recommendedAmount = event.params.recommendedAmount;
  a.sourceHash = event.params.sourceHash;
  a.timestamp = event.block.timestamp;
  a.save();

  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.amount = event.params.recommendedAmount;
  logEvent(event, "AIAssessor", "AssessmentPublished", p);
}
