// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DeployStack} from "./DeployStack.s.sol";
import {ProtocolRoles, ProtocolRoleConstants} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {PremiumDistributor} from "../src/PremiumDistributor.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";

/// @title DemoFlow
/// @author Anton Carlo Santoro
/// @notice Phase 12: repeatable END-TO-END demo of the NextBlock institutional
///         flow on **Anvil or Base Sepolia staging only** (chain guard inherited
///         from DeployStack — any other chain reverts). MockUSDC only: no real
///         funds, no real APIs, no mainnet.
///
///         The single broadcast key plays every institutional persona (staging
///         default: the deployer holds all canonical roles). Steps:
///           1.  Fresh stack deploy (DeployStack: wiring + verification + JSON)
///           2.  Mint MockUSDC (LP capital + cedant premium)
///           3.  KYC/whitelist the LP via ComplianceRegistry
///           4.  LP approves + deposits into the vault (nbUSDC minted)
///           5.  Cedant submits portfolio; Curator reviews/approves/activates
///           6.  Cedant pays the ceded premium via PremiumDistributor (split + UPR)
///           7.  Allocator proposes and executes the allocation (sole vault path)
///           8.  NavOracle publishes mock NAV + portfolio risk (valid confidence)
///           9.  Claim lifecycle: submit -> AI advisory -> Committee approval ->
///               vault reserve -> vault payout (sole claim path).
///               PARAMETRIC claim type so a single run works on a live chain;
///               the NON_PARAMETRIC dispute-window path is exercised in
///               test/DemoFlow.t.sol (time warp) and documented in DEMO_FLOW.md.
///           10. BordereauOracle assertion proposed (finalization requires the
///               liveness window to elapse: documented follow-up, never skipped)
///           11. NextBlockLens reads every dashboard and the script REVERTS if
///               any expected state is not AVAILABLE (no fake fallbacks)
///           12. USDC conservation check (delta-exact) + frontend address book
///               pointer (deployments/<chainId>-staging.json)
contract DemoFlow is Script, ProtocolRoleConstants {
    // --- Demo figures (USDC, 6 decimals) ---
    uint256 public constant LP_CAPITAL = 500_000e6;
    uint256 public constant PREMIUM = 100_000e6;
    uint256 public constant ALLOCATION = 150_000e6;
    uint256 public constant CLAIM_AMOUNT = 40_000e6;
    uint256 public constant COVERAGE_LIMIT = 1_000_000e6;
    uint16 public constant EXPECTED_LOSS_BPS = 6_500; // declared Braino.ai mock

    error DemoFlow__CheckFailed(string check);

    // --- Stack refs (storage keeps the script stack-shallow) ---
    DeployStack public deployStack;
    MockUSDC public usdc;
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    InsuranceVault public vault;
    PremiumDistributor public distributor;
    NavOracle public navOracle;
    VaultAllocator public allocator;
    AIAssessor public assessor;
    ClaimManager public claimManager;
    BordereauOracle public bordereau;
    NextBlockLens public lens;

    // --- Demo artifacts (public for test assertions) ---
    address public actor;
    uint256 public pid;
    uint256 public proposalId;
    uint256 public claimId;
    uint256 public assertionId;

    // Conservation snapshot (delta accounting => repeatable on reused chains)
    uint256 internal preActor;
    uint256 internal preVault;
    uint256 internal preDistributor;

    /// @dev CLI entrypoint: reads configuration from env, then delegates.
    function run() external {
        runWithKey(
            vm.envUint("PRIVATE_KEY"), // testnet placeholder key only
            vm.envOr("WRITE_DEPLOYMENT_JSON", true)
        );
    }

    /// @dev Parameterized entrypoint: tests call this directly (no env races).
    function runWithKey(uint256 pk, bool writeJson) public {
        // ---- Step 1: fresh staging stack (guarded, wired, verified) ----
        deployStack = new DeployStack();
        deployStack.runWithConfig(pk, writeJson, address(0));
        _bindStack();

        actor = vm.addr(pk);

        preActor = usdc.balanceOf(actor);
        preVault = usdc.balanceOf(address(vault));
        preDistributor = usdc.balanceOf(address(distributor));

        vm.startBroadcast(pk);
        _step2_mint();
        _step3_kyc();
        _step4_deposit();
        _step5_portfolio();
        _step6_premium();
        _step7_allocation();
        _step8_oracle();
        _step9_claim();
        _step10_bordereau();
        vm.stopBroadcast();

        _step11_lensChecks();
        _step12_conservationAndFrontend();
    }

    // --- Steps ---

    function _bindStack() internal {
        usdc = deployStack.usdc();
        protocolRoles = deployStack.protocolRoles();
        compliance = deployStack.compliance();
        portfolioRegistry = deployStack.portfolioRegistry();
        vault = deployStack.vault();
        distributor = deployStack.distributor();
        navOracle = deployStack.navOracle();
        allocator = deployStack.allocator();
        assessor = deployStack.assessor();
        claimManager = deployStack.claimManager();
        bordereau = deployStack.bordereau();
        lens = deployStack.lens();
    }

    function _step2_mint() internal {
        usdc.mint(actor, LP_CAPITAL + PREMIUM); // exactly what the demo needs
        console2.log("step 2  mint:        ", LP_CAPITAL + PREMIUM);
    }

    function _step3_kyc() internal {
        compliance.setWhitelist(actor, true);
        compliance.setKycExpiry(actor, uint64(block.timestamp + 365 days));
        compliance.setJurisdiction(actor, 44); // demo jurisdiction code
        console2.log("step 3  KYC/whitelist LP (ComplianceRegistry, on-chain)");
    }

    function _step4_deposit() internal {
        usdc.approve(address(vault), LP_CAPITAL);
        uint256 shares = vault.deposit(LP_CAPITAL, actor);
        console2.log("step 4  LP deposit:  ", LP_CAPITAL, " nbUSDC:", shares);
    }

    function _step5_portfolio() internal {
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026 (demo)",
                metadataURI: "ipfs://QmDemoDocs",
                documentHash: keccak256("demo-docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE_LIMIT,
                cededPremium: PREMIUM,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, EXPECTED_LOSS_BPS); // declared mock
        portfolioRegistry.activatePortfolio(pid);
        distributor.setPortfolioVault(pid, address(vault));
        console2.log("step 5  portfolio ACTIVE, id:", pid);
    }

    function _step6_premium() internal {
        usdc.approve(address(distributor), PREMIUM);
        distributor.receivePremium(pid, PREMIUM);
        console2.log("step 6  premium received (split + UPR):", PREMIUM);
    }

    function _step7_allocation() internal {
        proposalId = allocator.proposeAllocation(address(vault), pid, ALLOCATION);
        allocator.executeAllocation(proposalId);
        console2.log("step 7  allocation via VaultAllocator (sole path):", ALLOCATION);
    }

    function _step8_oracle() internal {
        navOracle.publishNav(address(vault), vault.totalAssets(), 9_000, keccak256("braino-nav-demo"));
        navOracle.publishPortfolioRisk(pid, 6_200, 9_000, keccak256("braino-risk-demo"));
        console2.log("step 8  mock NAV + risk published (MOCK_ORACLE source)");
    }

    function _step9_claim() internal {
        // PARAMETRIC: single-run friendly on live chains. Committee approval and
        // vault solvency/reserve checks still fully apply: the AI NEVER pays.
        claimId = claimManager.submitClaim(
            address(vault), pid, CLAIM_AMOUNT, ClaimManager.ClaimType.PARAMETRIC, keccak256("demo-evidence")
        );
        assessor.publishAssessment(
            claimId,
            8_200,
            1_200,
            9_100,
            AIAssessor.Recommendation.APPROVE,
            CLAIM_AMOUNT,
            keccak256("wavenure-claim-demo")
        );
        claimManager.attachAssessment(claimId); // advisory only
        claimManager.approveClaim(claimId, CLAIM_AMOUNT); // Committee authority
        claimManager.executeClaim(claimId); // vault reserves were taken; vault pays
        console2.log("step 9  claim PAID via ClaimManager -> InsuranceVault:", CLAIM_AMOUNT);
    }

    function _step10_bordereau() internal {
        assertionId = bordereau.proposeAssertion(
            pid,
            BordereauOracle.AssertionType.PREMIUM_BORDEREAU,
            keccak256("demo-premium-bordereau"),
            "ipfs://QmDemoBordereau",
            PREMIUM
        );
        console2.log("step 10 bordereau PROPOSED, id:", assertionId);
        console2.log("        finalize AFTER liveness (never skipped):");
        console2.log("        cast send <bordereau> 'finalizeAssertion(uint256)' <id>");
    }

    function _step11_lensChecks() internal view {
        // Protocol counters
        NextBlockLens.ProtocolStatusView memory ps = lens.getProtocolStatus();
        if (ps.vaultCount != 1) revert DemoFlow__CheckFailed("lens vaultCount");
        if (ps.portfolioCount != pid + 1) revert DemoFlow__CheckFailed("lens portfolioCount");
        if (ps.claimCount != claimId + 1) revert DemoFlow__CheckFailed("lens claimCount");
        if (ps.assertionCount != assertionId + 1) revert DemoFlow__CheckFailed("lens assertionCount");

        // Vault dashboard AVAILABLE and coherent with the payout
        NextBlockLens.VaultDashboardView memory vd = lens.getVaultDashboard(address(vault));
        if (vd.status != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("vault dashboard");
        if (vd.portfolioAllocated != ALLOCATION - CLAIM_AMOUNT) revert DemoFlow__CheckFailed("allocated exposure");
        if (vd.pendingClaims != 0) revert DemoFlow__CheckFailed("claim reserve released");

        // LP status: both compliance and vault sides AVAILABLE
        NextBlockLens.LPStatusView memory lp_ = lens.getLPStatus(address(vault), actor);
        if (lp_.complianceStatus != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("lp compliance");
        if (lp_.vaultStatus != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("lp vault");
        if (!lp_.canReceive || lp_.shareBalance == 0) revert DemoFlow__CheckFailed("lp position");

        // Portfolio + advisory risk
        NextBlockLens.PortfolioStatusView memory pf = lens.getPortfolioStatus(pid, address(vault));
        if (pf.status != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("portfolio status");
        if (pf.riskStatus != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("risk status");
        if (pf.riskSource != NextBlockLens.DataSource.MOCK_ORACLE) revert DemoFlow__CheckFailed("risk source label");

        // Premium dashboard with exact conservation of the split
        NextBlockLens.PremiumDashboardView memory pm = lens.getPremiumDashboard(pid);
        if (pm.status != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("premium dashboard");
        if (pm.gross != pm.lpQuota + pm.protocolFees + pm.underwritingFees) {
            revert DemoFlow__CheckFailed("premium split conservation");
        }

        // Claim PAID through the sole path
        NextBlockLens.ClaimDashboardView memory cd = lens.getClaimDashboard(claimId);
        if (cd.status != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("claim dashboard");
        if (cd.claim.status != ClaimManager.ClaimStatus.PAID) revert DemoFlow__CheckFailed("claim PAID");
        if (cd.assessmentSource != NextBlockLens.DataSource.MOCK_ORACLE) revert DemoFlow__CheckFailed("ai label");

        // Oracle AVAILABLE; bordereau correctly NONE until finalized (no fake data)
        NextBlockLens.OracleDashboardView memory od = lens.getOracleDashboard(address(vault));
        if (od.status != NextBlockLens.DataStatus.AVAILABLE) revert DemoFlow__CheckFailed("oracle dashboard");
        NextBlockLens.BordereauDashboardView memory bd =
            lens.getBordereauDashboard(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        if (bd.status != NextBlockLens.DataStatus.NONE) revert DemoFlow__CheckFailed("bordereau must be NONE");

        console2.log("step 11 lens checks: ALL AVAILABLE (bordereau NONE until finalized)");
    }

    function _step12_conservationAndFrontend() internal view {
        // USDC conservation (delta-exact): everything minted for the demo sits
        // in actor (claim payout) + vault (capital + LP quota - payout) +
        // distributor (accrued fees). No token leaks anywhere else.
        uint256 dActor = usdc.balanceOf(actor) - preActor;
        uint256 dVault = usdc.balanceOf(address(vault)) - preVault;
        uint256 dDistributor = usdc.balanceOf(address(distributor)) - preDistributor;
        if (dActor + dVault + dDistributor != LP_CAPITAL + PREMIUM) {
            revert DemoFlow__CheckFailed("USDC conservation");
        }
        if (dActor != CLAIM_AMOUNT) revert DemoFlow__CheckFailed("actor delta != claim payout");

        console2.log("step 12 USDC conservation: EXACT");
        console2.log("        frontend address book: deployments/<chainId>-staging.json");
        console2.log("=== DEMO FLOW COMPLETE ===");
    }
}
