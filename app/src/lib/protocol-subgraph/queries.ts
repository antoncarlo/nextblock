/**
 * Protocol-subgraph queries. Every query embeds META so each response can
 * prove how fresh the indexed state is (see client.ts / evaluateStaleness).
 * Field sets mirror the Raw* interfaces in entities.ts — keep them in sync.
 */

export const META = `_meta { block { number timestamp } hasIndexingErrors }`;

export const VAULTS_QUERY = `query Vaults($n: Int!) {
  ${META}
  vaults(first: $n, orderBy: createdAt, orderDirection: asc) {
    id name symbol displayName manager bufferRatioBps managementFeeBps
    createdAt depositCount withdrawCount totalDeposited totalWithdrawn
    premiumsRecorded claimsReserved claimsPaid feesCollected
  }
}`;

export const VAULT_FLOWS_QUERY = `query VaultFlows($vault: String!, $n: Int!) {
  ${META}
  vaultDeposits(first: $n, orderBy: timestamp, orderDirection: desc, where: { vault: $vault }) {
    id vault { id } owner assets shares timestamp txHash
  }
  vaultWithdrawals(first: $n, orderBy: timestamp, orderDirection: desc, where: { vault: $vault }) {
    id vault { id } owner assets shares timestamp txHash
  }
}`;

export const PORTFOLIOS_QUERY = `query Portfolios($n: Int!) {
  ${META}
  portfolios(first: $n, orderBy: submittedAt, orderDirection: desc) {
    id cedant structureType coverageLimit cededPremium inceptionTime expiryTime
    status expectedLossBps vault allocated premiumsReceivedGross submittedAt updatedAt
  }
}`;

export const CLAIMS_QUERY = `query Claims($n: Int!) {
  ${META}
  claims(first: $n, orderBy: submittedAt, orderDirection: desc) {
    id portfolioId vault claimant requestedAmount claimType status
    anomalyFlagged approvedAmount paidAmount reserved submittedAt updatedAt
  }
}`;

export const PREMIUM_FLOWS_QUERY = `query PremiumFlows($portfolioId: BigInt!, $n: Int!) {
  ${META}
  premiumFlows(first: $n, orderBy: timestamp, orderDirection: desc, where: { portfolioId: $portfolioId }) {
    id portfolioId kind counterparty amount timestamp txHash
  }
}`;

export const NAV_SERIES_QUERY = `query NavSeries($vault: Bytes!, $n: Int!) {
  ${META}
  navPoints(first: $n, orderBy: timestamp, orderDirection: desc, where: { vault: $vault }) {
    id vault nav confidenceBps timestamp
  }
}`;

export const ACTIVITY_QUERY = `query Activity($n: Int!) {
  ${META}
  protocolEvents(first: $n, orderBy: timestamp, orderDirection: desc) {
    id contract name vault portfolioId claimId actor amount timestamp txHash
  }
}`;

export const COMPLIANCE_ACCOUNT_QUERY = `query ComplianceAccount($id: ID!) {
  ${META}
  complianceAccount(id: $id) {
    id whitelisted blocked jurisdiction kycExpiry investorLimit updatedAt
  }
}`;
