// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {ComplianceRegistry} from "./ComplianceRegistry.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {InsuranceVault} from "./InsuranceVault.sol";
import {VaultFactory} from "./VaultFactory.sol";
import {PremiumDistributor} from "./PremiumDistributor.sol";
import {NavOracle} from "./NavOracle.sol";
import {VaultAllocator} from "./VaultAllocator.sol";
import {ClaimManager} from "./ClaimManager.sol";
import {AIAssessor} from "./AIAssessor.sol";
import {BordereauOracle} from "./BordereauOracle.sol";
import {AdapterRegistry} from "./AdapterRegistry.sol";

/// @title NextBlockLens
/// @author Anton Carlo Santoro
/// @notice Phase 10: canonical READ MODEL for the NextBlock protocol. One
///         contract that frontend, indexer, auditors and the Base Sepolia demo
///         query instead of stitching together raw module calls.
///
///         HARD BOUNDARIES (no second source of truth):
///         - READ-ONLY: every dashboard function is `view`. The lens holds NO
///           funds, mints nothing, moves nothing and mutates NO economic state.
///         - NO DUPLICATED ACCOUNTING: every figure is read from the module
///           that owns it (vault accounting from InsuranceVault, premium
///           splits from PremiumDistributor, claim state from ClaimManager...).
///           The lens never recomputes solvency, UPR or capacity on its own.
///         - NEVER-REVERTING DASHBOARDS: aggregate `get*` views degrade to
///           DataStatus.UNAVAILABLE / NONE instead of reverting, so one missing
///           module (gradual Base Sepolia rollout) cannot break a whole view.
///           Strict `raw*` twins revert with the underlying error for auditors.
///         - EXPLICIT DATA SOURCE: oracle/AI figures carry DataSource so the UI
///           can label mock-fed data; it must never present it as verified.
///
///         The ONLY mutable state is the module address book, settable by
///         OWNER_ROLE. This is operational configuration (non-economic): a
///         wrong address can only make a dashboard read wrong data, never move
///         funds, because no core module trusts the lens.
contract NextBlockLens is ProtocolRoleConstants {
    // --- Versioning ---
    /// @notice Lens implementation version.
    uint256 public constant LENS_VERSION = 1;

    /// @notice Schema version stamped into every view struct, so frontend and
    ///         indexer can detect ABI drift explicitly instead of mis-decoding.
    uint8 public constant SCHEMA_VERSION = 1;

    // --- Enums ---
    /// @notice Availability of a piece of data, instead of reverting views.
    enum DataStatus {
        UNAVAILABLE, // 0: module not configured / not deployed / call failed
        NONE, // 1: module live but no data for this key yet
        AVAILABLE, // 2: fresh, usable data
        STALE, // 3: data exists but violates the freshness guard
        PAUSED // 4: feed/module paused by the Sentinel
    }

    /// @notice Explicit provenance of the data (UI labelling requirement).
    enum DataSource {
        ONCHAIN, // 0: canonical on-chain protocol state
        MOCK_ORACLE, // 1: Braino.ai/WAVENURE MOCK feed (testnet, not verified)
        LEGACY_RETIRED, // 2: surface removed in Phase 9.5 (kept for labelling)
        NOT_AVAILABLE // 3: no source (module missing)
    }

    // --- Module address book ---
    struct ModuleAddresses {
        address portfolioRegistry;
        address complianceRegistry;
        address vaultFactory;
        address premiumDistributor;
        address navOracle;
        address vaultAllocator;
        address claimManager;
        address aiAssessor;
        address bordereauOracle;
        address adapterRegistry;
    }

    // --- View structs (schema v1) ---
    struct ProtocolStatusView {
        uint8 schemaVersion;
        uint256 lensVersion;
        uint256 chainId;
        ModuleAddresses modules;
        uint256 vaultCount; // VaultFactory (0 if unavailable)
        uint256 portfolioCount; // PortfolioRegistry
        uint256 claimCount; // ClaimManager
        uint256 assertionCount; // BordereauOracle
        uint256 adapterCount; // AdapterRegistry
        uint256 proposalCount; // VaultAllocator
    }

    struct VaultDashboardView {
        uint8 schemaVersion;
        DataStatus status;
        address vault;
        string name;
        address manager;
        uint256 totalAssets;
        uint256 totalShares;
        uint256 sharePrice; // assets per 1e18 shares (vault's own math)
        uint256 balance; // raw USDC balance
        uint256 unearnedPremiums; // UPR (vault accounting)
        uint256 pendingClaims; // claim reserves
        uint256 deployedCapital; // legacy policy deployment
        uint256 portfolioAllocated; // portfolio exposure
        uint256 availableBuffer;
        uint256 underwritingCapacity;
        uint256 depositCap; // 0 = uncapped
        uint256 bufferRatioBps;
        uint256 managementFeeBps;
        uint256 accumulatedFees;
        address boundClaimManager; // sole claim path (Phase 9.5)
        address boundVaultAllocator; // sole allocation path (Phase 9.5)
    }

    struct LPStatusView {
        uint8 schemaVersion;
        DataStatus complianceStatus; // compliance module availability
        DataStatus vaultStatus; // vault availability
        address lp;
        address vault;
        bool whitelisted;
        bool blocked;
        uint64 kycExpiry;
        bool kycExpired;
        uint16 jurisdictionCode;
        bool canReceive;
        uint256 shareBalance;
        uint256 assetValue; // vault.convertToAssets(shareBalance)
        uint256 maxDeposit;
        uint256 maxWithdraw;
        uint256 maxRedeem;
        bool redemptionEligible; // maxRedeem > 0
    }

    struct PortfolioStatusView {
        uint8 schemaVersion;
        DataStatus status;
        PortfolioRegistry.Portfolio portfolio;
        bool allocatable;
        uint256 allocatedExposure; // in the queried vault (0 if vault unset)
        uint256 premiumRecorded; // vault-recorded portfolio premium
        DataStatus riskStatus; // NavOracle risk attestation availability
        DataSource riskSource; // MOCK_ORACLE while Braino.ai feed is mocked
        uint16 riskScoreBps;
        uint16 riskConfidenceBps;
        uint64 riskUpdatedAt;
        bytes32 riskSourceHash;
    }

    struct PremiumDashboardView {
        uint8 schemaVersion;
        DataStatus status;
        uint256 portfolioId;
        address vault; // routing target (portfolioVault)
        uint256 gross;
        uint256 lpQuota;
        uint256 protocolFees;
        uint256 underwritingFees;
        uint256 protocolFeeBps;
        uint256 underwritingFeeBps;
        uint256 totalGrossReceived; // distributor-wide
        uint256 accruedProtocolFees; // distributor-wide, unclaimed
        uint256 accruedUnderwritingFees; // distributor-wide, unclaimed
    }

    struct ClaimDashboardView {
        uint8 schemaVersion;
        DataStatus status;
        ClaimManager.Claim claim;
        uint64 disputeWindow;
        bool disputeWindowElapsed;
        bool hasAssessment;
        DataSource assessmentSource; // MOCK_ORACLE: advisory only, never authority
        AIAssessor.Assessment assessment; // zeroed when hasAssessment == false
        bool anomalous;
    }

    struct OracleDashboardView {
        uint8 schemaVersion;
        DataStatus status; // PAUSED > NONE > STALE > AVAILABLE precedence
        DataSource source; // MOCK_ORACLE while feeds are mocked
        uint256 nav;
        uint16 confidenceBps;
        uint64 updatedAt;
        bytes32 sourceHash;
        bool feedPaused;
        bool anomalyFlagged;
        bool deviationWaiver;
        uint64 maxStaleness;
        uint256 maxDeviationBps;
        uint16 minConfidenceBps;
    }

    struct BordereauDashboardView {
        uint8 schemaVersion;
        DataStatus status; // NONE when nothing finalized for the key
        BordereauOracle.Assertion latestFinalized; // zeroed when status != AVAILABLE
        uint64 liveness;
        uint256 assertionCount;
    }

    struct AdapterDashboardView {
        uint8 schemaVersion;
        DataStatus status;
        AdapterRegistry.Adapter adapter; // zeroed when status == NONE/UNAVAILABLE
        bool active;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC). Immutable.
    ProtocolRoles public immutable protocolRoles;

    /// @notice Module address book (gradual rollout: any entry may be zero).
    ModuleAddresses public modules;

    // --- Events ---
    /// @notice Emitted when the module address book is updated.
    event ModulesUpdated(ModuleAddresses modules);

    // --- Errors ---
    /// @notice Caller lacks the required ProtocolRoles role.
    error NextBlockLens__UnauthorizedRole(address caller, bytes32 role);
    /// @notice Zero address/value or otherwise malformed parameters.
    error NextBlockLens__InvalidParams();

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert NextBlockLens__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @notice Wires roles and the initial module address book.
    constructor(address protocolRoles_, ModuleAddresses memory modules_) {
        if (protocolRoles_ == address(0)) revert NextBlockLens__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
        modules = modules_;
        emit ModulesUpdated(modules_);
    }

    // --- Configuration (OWNER_ROLE; operational, non-economic) ---

    /// @notice Update the module address book as modules land on Base Sepolia.
    ///         No core module trusts the lens: a wrong entry can only degrade
    ///         dashboards, never move funds.
    function setModules(ModuleAddresses calldata modules_) external onlyProtocolRole(OWNER_ROLE) {
        modules = modules_;
        emit ModulesUpdated(modules_);
    }

    // =========================================================================
    // 1. PROTOCOL STATUS
    // =========================================================================

    /// @notice Protocol-wide status. Never reverts: missing modules report 0.
    function getProtocolStatus() external view returns (ProtocolStatusView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.lensVersion = LENS_VERSION;
        v.chainId = block.chainid;
        v.modules = modules;

        if (_live(modules.vaultFactory)) {
            v.vaultCount = VaultFactory(modules.vaultFactory).getVaultCount();
        }
        if (_live(modules.portfolioRegistry)) {
            v.portfolioCount = PortfolioRegistry(modules.portfolioRegistry).getPortfolioCount();
        }
        if (_live(modules.claimManager)) {
            v.claimCount = ClaimManager(modules.claimManager).getClaimCount();
        }
        if (_live(modules.bordereauOracle)) {
            v.assertionCount = BordereauOracle(modules.bordereauOracle).getAssertionCount();
        }
        if (_live(modules.adapterRegistry)) {
            v.adapterCount = AdapterRegistry(modules.adapterRegistry).getAdapterCount();
        }
        if (_live(modules.vaultAllocator)) {
            v.proposalCount = VaultAllocator(modules.vaultAllocator).getProposalCount();
        }
    }

    // =========================================================================
    // 2. VAULT DASHBOARD
    // =========================================================================

    /// @notice Aggregated vault accounting. Never reverts (UNAVAILABLE on failure).
    function getVaultDashboard(address vault) external view returns (VaultDashboardView memory v) {
        if (_live(vault)) {
            try this.rawVaultDashboard(vault) returns (VaultDashboardView memory r) {
                return r;
            } catch {} // fall through to UNAVAILABLE
        }
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        v.vault = vault;
    }

    /// @notice Strict twin: reverts with the underlying error (auditor use).
    /// @dev Reads ONLY vault-owned accounting; the lens recomputes nothing.
    function rawVaultDashboard(address vault) external view returns (VaultDashboardView memory v) {
        InsuranceVault iv = InsuranceVault(vault);

        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.AVAILABLE;
        v.vault = vault;
        v.name = iv.vaultName();
        v.manager = iv.vaultManager();
        v.totalAssets = iv.totalAssets();
        v.totalShares = iv.totalSupply();
        // Display-only price derived from the vault's own conversion math.
        v.sharePrice = iv.convertToAssets(1e18);
        _fillVaultAccounting(v, iv);
        v.bufferRatioBps = iv.bufferRatioBps();
        v.managementFeeBps = iv.managementFeeBps();
        v.accumulatedFees = iv.accumulatedFees();
        v.boundClaimManager = iv.claimManager();
        v.boundVaultAllocator = iv.vaultAllocator();
    }

    // =========================================================================
    // 3. LP STATUS
    // =========================================================================

    /// @notice Compliance + position view for an institutional LP. Never reverts;
    ///         compliance and vault availability are reported independently.
    function getLPStatus(address vault, address lp) external view returns (LPStatusView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.lp = lp;
        v.vault = vault;
        v.complianceStatus = DataStatus.UNAVAILABLE;
        v.vaultStatus = DataStatus.UNAVAILABLE;

        if (_live(modules.complianceRegistry)) {
            try this.rawLPCompliance(lp) returns (
                bool whitelisted_, bool blocked_, uint64 kycExpiry_, uint16 jurisdiction_, bool canReceive_
            ) {
                v.complianceStatus = DataStatus.AVAILABLE;
                v.whitelisted = whitelisted_;
                v.blocked = blocked_;
                v.kycExpiry = kycExpiry_;
                v.kycExpired = kycExpiry_ != 0 && kycExpiry_ < uint64(block.timestamp);
                v.jurisdictionCode = jurisdiction_;
                v.canReceive = canReceive_;
            } catch {}
        }

        if (_live(vault)) {
            try this.rawLPPosition(vault, lp) returns (
                uint256 shares_, uint256 assets_, uint256 maxDeposit_, uint256 maxWithdraw_, uint256 maxRedeem_
            ) {
                v.vaultStatus = DataStatus.AVAILABLE;
                v.shareBalance = shares_;
                v.assetValue = assets_;
                v.maxDeposit = maxDeposit_;
                v.maxWithdraw = maxWithdraw_;
                v.maxRedeem = maxRedeem_;
                v.redemptionEligible = maxRedeem_ > 0;
            } catch {}
        }
    }

    /// @notice Strict compliance read (auditor use).
    function rawLPCompliance(address lp)
        external
        view
        returns (bool whitelisted_, bool blocked_, uint64 kycExpiry_, uint16 jurisdiction_, bool canReceive_)
    {
        ComplianceRegistry cr = ComplianceRegistry(modules.complianceRegistry);
        whitelisted_ = cr.whitelisted(lp);
        blocked_ = cr.blocked(lp);
        kycExpiry_ = cr.kycExpiry(lp);
        jurisdiction_ = cr.jurisdictionCode(lp);
        canReceive_ = cr.canReceive(lp);
    }

    /// @notice Strict vault position read (auditor use).
    function rawLPPosition(address vault, address lp)
        external
        view
        returns (uint256 shares_, uint256 assets_, uint256 maxDeposit_, uint256 maxWithdraw_, uint256 maxRedeem_)
    {
        InsuranceVault iv = InsuranceVault(vault);
        shares_ = iv.balanceOf(lp);
        assets_ = iv.convertToAssets(shares_);
        maxDeposit_ = iv.maxDeposit(lp);
        maxWithdraw_ = iv.maxWithdraw(lp);
        maxRedeem_ = iv.maxRedeem(lp);
    }

    // =========================================================================
    // 4. PORTFOLIO STATUS
    // =========================================================================

    /// @notice Portfolio lifecycle + exposure + advisory risk view. Never reverts:
    ///         unknown id => NONE; missing registry => UNAVAILABLE.
    /// @param vault Vault whose exposure to report (address(0) skips exposure).
    function getPortfolioStatus(uint256 portfolioId, address vault)
        external
        view
        returns (PortfolioStatusView memory v)
    {
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        v.riskStatus = DataStatus.UNAVAILABLE;
        v.riskSource = DataSource.NOT_AVAILABLE;

        if (!_live(modules.portfolioRegistry)) return v;

        try PortfolioRegistry(modules.portfolioRegistry).getPortfolio(portfolioId) returns (
            PortfolioRegistry.Portfolio memory p
        ) {
            v.status = DataStatus.AVAILABLE;
            v.portfolio = p;
            v.allocatable = PortfolioRegistry(modules.portfolioRegistry).isAllocatable(portfolioId);
        } catch {
            v.status = DataStatus.NONE;
            return v;
        }

        if (_live(vault)) {
            try this.rawPortfolioExposure(vault, portfolioId) returns (uint256 exposure_, uint256 premium_) {
                v.allocatedExposure = exposure_;
                v.premiumRecorded = premium_;
            } catch {}
        }

        if (_live(modules.navOracle)) {
            (bool valid, NavOracle.RiskAttestation memory att) =
                NavOracle(modules.navOracle).tryGetPortfolioRisk(portfolioId);
            v.riskSource = DataSource.MOCK_ORACLE;
            if (att.updatedAt == 0) {
                v.riskStatus = DataStatus.NONE;
            } else {
                v.riskStatus = valid ? DataStatus.AVAILABLE : DataStatus.STALE;
                v.riskScoreBps = att.riskScoreBps;
                v.riskConfidenceBps = att.confidenceBps;
                v.riskUpdatedAt = att.updatedAt;
                v.riskSourceHash = att.sourceHash;
            }
        }
    }

    /// @notice Strict exposure read (auditor use).
    function rawPortfolioExposure(address vault, uint256 portfolioId)
        external
        view
        returns (uint256 exposure_, uint256 premium_)
    {
        InsuranceVault iv = InsuranceVault(vault);
        exposure_ = iv.portfolioAllocation(portfolioId);
        premium_ = iv.portfolioPremium(portfolioId);
    }

    // =========================================================================
    // 5. PREMIUM DASHBOARD
    // =========================================================================

    /// @notice Premium split accounting for a portfolio. Never reverts.
    function getPremiumDashboard(uint256 portfolioId) external view returns (PremiumDashboardView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.portfolioId = portfolioId;
        v.status = DataStatus.UNAVAILABLE;
        if (!_live(modules.premiumDistributor)) return v;

        try this.rawPremiumDashboard(portfolioId) returns (PremiumDashboardView memory r) {
            return r;
        } catch {}
    }

    /// @notice Strict twin: reverts with the underlying error (auditor use).
    function rawPremiumDashboard(uint256 portfolioId) external view returns (PremiumDashboardView memory v) {
        PremiumDistributor pd = PremiumDistributor(modules.premiumDistributor);

        v.schemaVersion = SCHEMA_VERSION;
        v.portfolioId = portfolioId;
        v.vault = pd.portfolioVault(portfolioId);

        PremiumDistributor.PremiumAccounting memory acc = pd.getPremiumAccounting(portfolioId);
        v.status = acc.gross == 0 ? DataStatus.NONE : DataStatus.AVAILABLE;
        v.gross = acc.gross;
        v.lpQuota = acc.lpQuota;
        v.protocolFees = acc.protocolFees;
        v.underwritingFees = acc.underwritingFees;

        v.protocolFeeBps = pd.protocolFeeBps();
        v.underwritingFeeBps = pd.underwritingFeeBps();
        v.totalGrossReceived = pd.totalGrossReceived();
        v.accruedProtocolFees = pd.accruedProtocolFees();
        v.accruedUnderwritingFees = pd.accruedUnderwritingFees();
    }

    // =========================================================================
    // 6. CLAIM DASHBOARD
    // =========================================================================

    /// @notice Claim lifecycle + advisory AI assessment. Never reverts:
    ///         unknown claim => NONE. The AI block is labelled MOCK_ORACLE and
    ///         is advisory only — approval authority stays with the committee.
    function getClaimDashboard(uint256 claimId) external view returns (ClaimDashboardView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        v.assessmentSource = DataSource.NOT_AVAILABLE;
        if (!_live(modules.claimManager)) return v;

        try ClaimManager(modules.claimManager).getClaim(claimId) returns (ClaimManager.Claim memory c) {
            v.status = DataStatus.AVAILABLE;
            v.claim = c;
            v.disputeWindow = ClaimManager(modules.claimManager).disputeWindow();
            v.disputeWindowElapsed = uint64(block.timestamp) > c.challengeDeadline;
        } catch {
            v.status = DataStatus.NONE;
            return v;
        }

        if (_live(modules.aiAssessor)) {
            AIAssessor ai = AIAssessor(modules.aiAssessor);
            if (ai.hasAssessment(claimId)) {
                v.hasAssessment = true;
                v.assessmentSource = DataSource.MOCK_ORACLE;
                v.assessment = ai.getAssessment(claimId);
                v.anomalous = ai.isAnomalous(claimId);
            }
        }
    }

    // =========================================================================
    // 7. ORACLE DASHBOARD
    // =========================================================================

    /// @notice NAV feed health for a vault. Never reverts. Status precedence:
    ///         UNAVAILABLE > PAUSED > NONE > STALE > AVAILABLE.
    function getOracleDashboard(address vault) external view returns (OracleDashboardView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        v.source = DataSource.NOT_AVAILABLE;
        if (!_live(modules.navOracle)) return v;

        NavOracle oracle = NavOracle(modules.navOracle);
        v.source = DataSource.MOCK_ORACLE;

        NavOracle.NavAttestation memory att = oracle.rawNavAttestation(vault);
        v.nav = att.nav;
        v.confidenceBps = att.confidenceBps;
        v.updatedAt = att.updatedAt;
        v.sourceHash = att.sourceHash;

        v.feedPaused = oracle.vaultFeedPaused(vault);
        v.anomalyFlagged = oracle.vaultAnomalyFlagged(vault);
        v.deviationWaiver = oracle.deviationWaiver(vault);
        v.maxStaleness = oracle.maxStaleness();
        v.maxDeviationBps = oracle.maxDeviationBps();
        v.minConfidenceBps = oracle.minConfidenceBps();

        if (v.feedPaused) {
            v.status = DataStatus.PAUSED;
        } else if (att.updatedAt == 0) {
            v.status = DataStatus.NONE;
        } else if (uint64(block.timestamp) > att.updatedAt + v.maxStaleness) {
            v.status = DataStatus.STALE;
        } else {
            v.status = DataStatus.AVAILABLE;
        }
    }

    // =========================================================================
    // 8. BORDEREAU DASHBOARD
    // =========================================================================

    /// @notice Latest FINALIZED bordereau attestation for a portfolio/type.
    ///         Never reverts: nothing finalized => NONE (consumers must treat
    ///         unverified bordereau data as absent — same rule as the oracle).
    function getBordereauDashboard(uint256 portfolioId, BordereauOracle.AssertionType assertionType)
        external
        view
        returns (BordereauDashboardView memory v)
    {
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        if (!_live(modules.bordereauOracle)) return v;

        BordereauOracle bo = BordereauOracle(modules.bordereauOracle);
        v.liveness = bo.liveness();
        v.assertionCount = bo.getAssertionCount();

        try bo.latestFinalized(portfolioId, assertionType) returns (BordereauOracle.Assertion memory a) {
            v.status = DataStatus.AVAILABLE;
            v.latestFinalized = a;
        } catch {
            v.status = DataStatus.NONE;
        }
    }

    // =========================================================================
    // 9. ADAPTER DASHBOARD
    // =========================================================================

    /// @notice External risk-pool adapter status. Never reverts:
    ///         unknown adapter => NONE.
    function getAdapterDashboard(bytes32 adapterId) external view returns (AdapterDashboardView memory v) {
        v.schemaVersion = SCHEMA_VERSION;
        v.status = DataStatus.UNAVAILABLE;
        if (!_live(modules.adapterRegistry)) return v;

        AdapterRegistry ar = AdapterRegistry(modules.adapterRegistry);
        try ar.getAdapter(adapterId) returns (AdapterRegistry.Adapter memory a) {
            v.status = DataStatus.AVAILABLE;
            v.adapter = a;
            v.active = ar.isAdapterActive(adapterId);
        } catch {
            v.status = DataStatus.NONE;
        }
    }

    // --- Internal ---

    /// @dev Copies the vault-owned accounting tuple into the view struct.
    ///      Isolated to keep the caller's stack shallow (via_ir = false).
    function _fillVaultAccounting(VaultDashboardView memory v, InsuranceVault iv) internal view {
        (
            uint256 balance_,
            uint256 upr_,
            uint256 pendingClaims_,
            uint256 deployed_,
            uint256 portfolioAllocated_,
            uint256 buffer_,
            uint256 capacity_,
            uint256 cap_
        ) = iv.getVaultAccounting();
        v.balance = balance_;
        v.unearnedPremiums = upr_;
        v.pendingClaims = pendingClaims_;
        v.deployedCapital = deployed_;
        v.portfolioAllocated = portfolioAllocated_;
        v.availableBuffer = buffer_;
        v.underwritingCapacity = capacity_;
        v.depositCap = cap_;
    }

    /// @dev A module is live only if configured AND deployed (has code). This is
    ///      what lets dashboards degrade gracefully during gradual rollout.
    function _live(address module) internal view returns (bool) {
        return module != address(0) && module.code.length > 0;
    }
}
