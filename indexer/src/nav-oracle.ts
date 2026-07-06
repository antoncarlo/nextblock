// NavOracle mappings: per-vault NAV feed state, the immutable NAV time
// series, portfolio risk publications and anomaly/pause telemetry.

import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  NavPublished,
  NavAnomalyDetected,
  PortfolioRiskPublished,
  FeedPaused,
  FeedUnpaused,
} from "../generated/NavOracle/NavOracle";
import { NavFeed, NavPoint, PortfolioRiskPoint } from "../generated/schema";
import { eventId, logEvent, LogParams } from "./helpers";

function feedOf(vault: Address, ts: BigInt): NavFeed {
  let f = NavFeed.load(vault.toHexString());
  if (f == null) {
    f = new NavFeed(vault.toHexString());
    f.lastNav = BigInt.zero();
    f.lastConfidenceBps = 0;
    f.lastSourceHash = Bytes.empty();
    f.paused = false;
    f.anomalyCount = 0;
    f.pointCount = 0;
  }
  f.publishedAt = ts;
  return f as NavFeed;
}

export function handleNavPublished(event: NavPublished): void {
  const f = feedOf(event.params.vault, event.block.timestamp);
  f.lastNav = event.params.nav;
  f.lastConfidenceBps = event.params.confidenceBps;
  f.lastSourceHash = event.params.sourceHash;
  f.pointCount = f.pointCount + 1;
  f.save();

  const pt = new NavPoint(eventId(event));
  pt.vault = event.params.vault;
  pt.nav = event.params.nav;
  pt.confidenceBps = event.params.confidenceBps;
  pt.sourceHash = event.params.sourceHash;
  pt.timestamp = event.block.timestamp;
  pt.blockNumber = event.block.number;
  pt.save();

  const p = new LogParams();
  p.vault = event.params.vault;
  p.amount = event.params.nav;
  logEvent(event, "NavOracle", "NavPublished", p);
}

export function handleNavAnomalyDetected(event: NavAnomalyDetected): void {
  const f = feedOf(event.params.vault, event.block.timestamp);
  f.anomalyCount = f.anomalyCount + 1;
  f.save();

  const p = new LogParams();
  p.vault = event.params.vault;
  p.amount = event.params.attemptedNav;
  logEvent(event, "NavOracle", "NavAnomalyDetected", p);
}

export function handlePortfolioRiskPublished(event: PortfolioRiskPublished): void {
  const pt = new PortfolioRiskPoint(eventId(event));
  pt.portfolioId = event.params.portfolioId;
  pt.riskScoreBps = event.params.riskScoreBps;
  pt.confidenceBps = event.params.confidenceBps;
  pt.sourceHash = event.params.sourceHash;
  pt.timestamp = event.block.timestamp;
  pt.save();

  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  logEvent(event, "NavOracle", "PortfolioRiskPublished", p);
}

export function handleFeedPaused(event: FeedPaused): void {
  const f = feedOf(event.params.vault, event.block.timestamp);
  f.paused = true;
  f.save();
  const p = new LogParams();
  p.vault = event.params.vault;
  p.actor = event.params.by;
  logEvent(event, "NavOracle", "FeedPaused", p);
}

export function handleFeedUnpaused(event: FeedUnpaused): void {
  const f = feedOf(event.params.vault, event.block.timestamp);
  f.paused = false;
  f.save();
  const p = new LogParams();
  p.vault = event.params.vault;
  p.actor = event.params.by;
  logEvent(event, "NavOracle", "FeedUnpaused", p);
}
