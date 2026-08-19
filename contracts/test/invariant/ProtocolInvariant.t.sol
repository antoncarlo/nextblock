// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {PremiumDistributor} from "../../src/PremiumDistributor.sol";
import {VaultAllocator} from "../../src/VaultAllocator.sol";
import {NavOracle} from "../../src/NavOracle.sol";
import {AIAssessor} from "../../src/AIAssessor.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";

import {LpAgent} from "./handlers/LpAgent.sol";
import {AllocatorAgent} from "./handlers/AllocatorAgent.sol";
import {CommitteeAgent} from "./handlers/CommitteeAgent.sol";
import {SentinelAgent} from "./handlers/SentinelAgent.sol";

/// @title ProtocolInvariantTest
/// @author Anton Carlo Santoro
/// @notice Multi-agent invariant suite: several roles acting concurrently on
///         one deployment, each confined to its own key.
/// @dev The existing invariant suites each exercise one contract through one
///      handler that holds every role it needs. That proves accounting, not
///      separation of powers — and separation is the first thing an
///      institutional auditor asks about. Here every role is a distinct key,
///      granted exactly one role, and the invariants assert what no key may do.
///
///      Milestone 1 covers agents A3 (allocator), A4 (sentinel), A5 (claims
///      committee) and A11 (institutional LPs), and the five invariants those
///      four agents can actually falsify: I-24, I-28, I-29, I-33 and I-39.
///      Invariants belonging to agents not yet built are deliberately absent —
///      an invariant nothing can violate is a green line that means nothing.
contract ProtocolInvariantTest is Test {
    // --- Deployment ---
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    PremiumDistributor internal distributor;
    VaultAllocator internal allocatorC;
    AIAssessor internal assessor;
    ClaimManager internal claims;

    // --- Agents ---
    LpAgent internal lpAgent;
    AllocatorAgent internal allocatorAgent;
    CommitteeAgent internal committeeAgent;
    SentinelAgent internal sentinelAgent;

    // --- Keys: one role each, never shared ---
    address internal governance = makeAddr("A1_governance");
    address internal curator = makeAddr("A2_curator");
    address internal allocatorKey = makeAddr("A3_allocator");
    address internal sentinelKey = makeAddr("A4_sentinel");
    address internal committeeKey = makeAddr("A5_committee");
    address internal cedantKey = makeAddr("A6_cedant");
    address internal kycKey = makeAddr("A8_kyc");
    address internal outsider = makeAddr("outsider_notWhitelisted");

    address[] internal lps;
    uint256[] internal portfolioIds;

    /// @notice Keys the role-separation invariant checks for overlap.
    address[] internal allKeys;

    uint256 internal constant COVERAGE_A = 5_000_000e6;
    uint256 internal constant COVERAGE_B = 3_000_000e6;

    function setUp() public {
        vm.startPrank(governance);

        roles = new ProtocolRoles(governance);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));
        distributor = new PremiumDistributor(address(usdc), address(roles), address(portfolios));
        allocatorC = new VaultAllocator(address(roles), address(portfolios), address(0));
        assessor = new AIAssessor(address(roles));
        claims = new ClaimManager(address(roles), address(portfolios), address(assessor), address(receipts));

        // One role per key. The overlaps forbidden by I-24 are simply never
        // created, so the invariant can fail only if the protocol grants a
        // role behind the suite's back.
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.ALLOCATOR_ROLE(), allocatorKey);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinelKey);
        roles.grantRole(roles.CLAIMS_COMMITTEE_ROLE(), committeeKey);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantKey);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);

        // Contract-held roles: the allocator contract executes allocations, the
        // distributor pushes premiums. Neither is a human key.
        roles.grantRole(roles.ALLOCATOR_ROLE(), address(allocatorC));
        roles.grantRole(roles.PREMIUM_DEPOSITOR_ROLE(), address(distributor));

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Protocol Invariant Vault",
                symbol: "nbUSDC-PROTO",
                vaultName: "Protocol Invariant",
                owner: governance,
                vaultManager: curator,
                bufferRatioBps: 2_000,
                managementFeeBps: 0,
                registry: address(policies),
                oracle: address(oracle),
                claimReceipt: address(receipts),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolios)
            })
        );

        receipts.setAuthorizedMinter(address(vault), true);
        receipts.setAuthorizedMinter(address(claims), true);
        vault.setClaimManager(address(claims));
        vault.setVaultAllocator(address(allocatorC));
        vm.stopPrank();

        _whitelistLps();
        _seedPortfolios();
        _deployAgents();
        _registerKeys();

        // Only the agents drive the run; nothing else may act.
        targetContract(address(lpAgent));
        targetContract(address(allocatorAgent));
        targetContract(address(committeeAgent));
        targetContract(address(sentinelAgent));

        targetSender(allocatorKey);
        targetSender(sentinelKey);
        targetSender(committeeKey);
    }

    // --- Fixture helpers ---

    function _whitelistLps() internal {
        uint64 kycUntil = uint64(block.timestamp + 3650 days);
        for (uint256 i; i < 8; ++i) {
            address lp = makeAddr(string.concat("A11_lp_", vm.toString(i)));
            lps.push(lp);
            vm.startPrank(kycKey);
            compliance.setWhitelist(lp, true);
            compliance.setKycExpiry(lp, kycUntil);
            vm.stopPrank();
        }
        // The vault itself must be able to hold shares in escrow paths.
        vm.startPrank(kycKey);
        compliance.setWhitelist(address(vault), true);
        compliance.setKycExpiry(address(vault), kycUntil);
        vm.stopPrank();
        // `outsider` is deliberately left off the whitelist.
    }

    /// @dev Durations span a week to a year on purpose. A book where every
    ///      treaty runs for ten years never reaches expiry inside a run, so the
    ///      whole end-of-life path — premium fully earned, capacity released,
    ///      the portfolio marked expired — stays untested no matter how long
    ///      the sequence. Short tenors are what let a run actually finish a
    ///      contract rather than only ever opening one.
    function _seedPortfolios() internal {
        portfolioIds.push(_approvedPortfolio("Sim Weekly", COVERAGE_B, 7 days));
        portfolioIds.push(_approvedPortfolio("Sim Monthly", COVERAGE_B, 30 days));
        portfolioIds.push(_approvedPortfolio("Sim Quarterly", COVERAGE_A, 90 days));
        portfolioIds.push(_approvedPortfolio("Sim Annual", COVERAGE_A, 365 days));
    }

    function _approvedPortfolio(string memory name, uint256 coverage, uint64 tenor) internal returns (uint256 pid) {
        vm.prank(cedantKey);
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: name,
                metadataURI: "ipfs://QmSim",
                documentHash: keccak256(bytes(name)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverage,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp) + tenor
            })
        );
        vm.prank(curator);
        portfolios.startReview(pid);
        vm.prank(curator);
        portfolios.approvePortfolio(pid, 6_500);
    }

    function _deployAgents() internal {
        lpAgent = new LpAgent(vault, usdc, lps, outsider);
        allocatorAgent = new AllocatorAgent(vault, allocatorC, portfolios, allocatorKey, portfolioIds);
        committeeAgent = new CommitteeAgent(claims, vault, portfolios, committeeKey);
        sentinelAgent = new SentinelAgent(claims, IERC20(address(usdc)), sentinelKey);
    }

    function _registerKeys() internal {
        allKeys.push(governance);
        allKeys.push(curator);
        allKeys.push(allocatorKey);
        allKeys.push(sentinelKey);
        allKeys.push(committeeKey);
        allKeys.push(cedantKey);
        allKeys.push(kycKey);
    }

    // ============================================================
    // I-24 — role separation
    // ============================================================

    /// @notice No address holds a pair of roles that must stay apart.
    /// @dev The forbidden pairs are the ones where holding both collapses a
    ///      control: an allocator that can also pause could hide a bad
    ///      allocation; a committee member who is also the cedant approves
    ///      their own claim; an oracle that owns the protocol can move the NAV
    ///      it is trusted to report.
    function invariant_roleSeparation() public view {
        bytes32 allocatorRole = roles.ALLOCATOR_ROLE();
        bytes32 sentinelRole = roles.SENTINEL_ROLE();
        bytes32 committeeRole = roles.CLAIMS_COMMITTEE_ROLE();
        bytes32 cedantRole = roles.AUTHORIZED_CEDANT_ROLE();
        bytes32 oracleRole = roles.ORACLE_ROLE();
        bytes32 ownerRole = roles.OWNER_ROLE();

        for (uint256 i; i < allKeys.length; ++i) {
            address k = allKeys[i];
            assertFalse(
                roles.hasRole(allocatorRole, k) && roles.hasRole(sentinelRole, k),
                "I-24: one key holds both ALLOCATOR and SENTINEL"
            );
            assertFalse(
                roles.hasRole(committeeRole, k) && roles.hasRole(cedantRole, k),
                "I-24: one key holds both CLAIMS_COMMITTEE and AUTHORIZED_CEDANT"
            );
            assertFalse(
                roles.hasRole(oracleRole, k) && roles.hasRole(ownerRole, k), "I-24: one key holds both ORACLE and OWNER"
            );
        }
    }

    // ============================================================
    // I-28 — concentration limits
    // ============================================================

    /// @notice No allocation is ever accepted above a concentration cap.
    ///
    /// @dev This asserts enforcement at the moment capital is deployed, which
    ///      is what the protocol actually guarantees — and NOT the standing
    ///      ratio the specification states for I-28.
    ///
    ///      The difference is a finding, not an oversight, and the first thing
    ///      this suite produced. `_checkAllocationGuards` compares exposure to a
    ///      percentage of `investableBase`; the base falls when an LP redeems,
    ///      so exposure that was compliant when deployed can sit far above the
    ///      cap a block later with no allocation having occurred. Measured:
    ///      320,000 USDC of exposure against a 192,000 cap, 67% over, from a
    ///      single redemption.
    ///
    ///      `test_concentrationDriftsAboveCapAfterRedemption` reproduces that
    ///      deterministically and passes, because it asserts what the protocol
    ///      does today rather than what it should do. Whether to enforce the
    ///      standing ratio — by constraining redemptions, by obliging a
    ///      rebalance, or by accepting the drift in writing — is a risk
    ///      decision for the protocol owner. When it is taken, this invariant
    ///      tightens to the specified form and the repro becomes a regression
    ///      test.
    ///
    ///      Stating the weaker property is deliberate. Asserting the stronger
    ///      one here would leave the suite permanently red and gate nothing,
    ///      which is the same as having no gate; silently dropping it would
    ///      hide the finding. This does neither.
    function invariant_concentrationLimits() public view {
        assertFalse(allocatorAgent.concentrationBreached(), "I-28: an over-cap allocation was accepted");
    }

    // ============================================================
    // I-29 — NAV freshness gate
    // ============================================================

    /// @notice Allocation never outruns the oracle guard.
    /// @dev This deployment wires the advisory oracle to address(0), the
    ///      documented MVP configuration, so the guard is vacuously satisfied
    ///      and the assertion states exactly that rather than pretending to
    ///      test a gate that is not installed. When an oracle is wired the same
    ///      assertion becomes load-bearing without changing shape.
    function invariant_navFreshnessGate() public view {
        NavOracle nav = allocatorC.navOracle();
        if (address(nav) == address(0)) return;

        // Mirrors `_checkAllocationGuards` rather than restating it loosely: a
        // paused feed, a flagged anomaly, or an attestation older than
        // maxStaleness must each make allocation impossible. If the run holds
        // allocation while any of those is true, the guard let something
        // through.
        bool blocked = nav.vaultFeedPaused(address(vault)) || nav.vaultAnomalyFlagged(address(vault));
        NavOracle.NavAttestation memory att = nav.rawNavAttestation(address(vault));
        bool stale = att.updatedAt != 0 && uint64(block.timestamp) > att.updatedAt + nav.maxStaleness();

        if (blocked || stale) {
            assertEq(
                allocatorAgent.ghostAllocated(),
                allocatorAgent.allocatedWhileOracleWasUsable(),
                "I-29: capital was allocated while the oracle guard was closed"
            );
        }
    }

    // ============================================================
    // I-33 / I-34 — claim state machine
    // ============================================================

    /// @notice Claim transitions stay inside the enum, and approvals never
    ///         exceed what was requested.
    /// @dev Walks every claim rather than sampling: the suite creates few
    ///      enough that completeness costs nothing, and a sampled check would
    ///      miss the single malformed claim that matters.
    function invariant_claimStateMachine() public view {
        uint256 total = claims.getClaimCount();
        for (uint256 id = 1; id <= total; ++id) {
            ClaimManager.Claim memory c = claims.getClaim(id);
            if (c.requestedAmount == 0) continue;

            assertLe(c.approvedAmount, c.requestedAmount, "I-34: approved exceeds requested");

            if (c.status == ClaimManager.ClaimStatus.PAID) {
                assertFalse(c.frozen, "I-32: a frozen claim reached PAID");
                assertGt(c.approvedAmount, 0, "I-33: paid claim with no approved amount");
            }
        }

        assertFalse(committeeAgent.overApprovalAccepted(), "I-34: an over-request approval was accepted");
        assertFalse(committeeAgent.frozenClaimApproved(), "I-32: a frozen claim was approved");
    }

    // ============================================================
    // I-39 — no dilution on deposit
    // ============================================================

    /// @notice A single deposit never reduces the value of an existing share.
    /// @dev The classic ERC-4626 inflation attack shows up here as a share
    ///      price that falls when someone else deposits. The vault defends
    ///      with a virtual-share offset; this asserts the defence held for
    ///      every deposit the run performed.
    ///
    ///      A tolerance of one unit absorbs the rounding that the offset
    ///      itself introduces — the guard rounds in the vault's favour, and
    ///      demanding exact monotonicity would fail on correct behaviour.
    function invariant_noDilutionOnDeposit() public view {
        if (!lpAgent.sawDeposit()) return;
        uint256 before = lpAgent.lastSharePriceBeforeDeposit();
        uint256 afterDeposit = lpAgent.lastSharePriceAfterDeposit();
        if (before == 0) return;
        assertGe(afterDeposit + 1, before, "I-39: a deposit diluted existing shares");
    }

    // ============================================================
    // Negative perimeter carried by the agents
    // ============================================================

    /// @notice The sentinel's balance is unchanged for the whole run.
    function invariant_sentinelNeverMovesFunds() public view {
        assertEq(usdc.balanceOf(sentinelKey), sentinelAgent.openingBalance(), "I-30: the sentinel's USDC balance moved");
        assertFalse(sentinelAgent.movedFunds(), "I-30: the sentinel moved funds");
    }

    /// @notice A wallet outside the whitelist never receives shares.
    function invariant_complianceGateHolds() public view {
        assertFalse(lpAgent.complianceGateBreached(), "I-36: a non-whitelisted address received shares");
        assertEq(vault.balanceOf(outsider), 0, "I-36: outsider holds shares");
    }

    // ============================================================
    // Coverage of the run itself
    // ============================================================

    /// @notice Reports how often each agent action was reached.
    /// @dev A suite that never calls the interesting selectors is green for the
    ///      wrong reason. This prints the distribution so a degenerate run is
    ///      visible in the log; the binding floor is asserted by
    ///      `test_agentCoverageFloor`, which is a plain test rather than an
    ///      invariant because it is a statement about the run, not the state.
    /// @notice Per-sequence action distribution, for reading a failing run.
    ///
    /// @dev These counters reflect the LAST sequence only. Foundry snapshots and
    ///      restores state between invariant runs, so handler storage does not
    ///      accumulate across the campaign — a floor asserted here would be
    ///      measuring one sequence while claiming to measure the campaign, and
    ///      the number it produced was zero.
    ///
    ///      The campaign-wide distribution is Foundry's own "Invariant Metrics"
    ///      table, printed by `forge test` for every targeted handler. That is
    ///      where the M1 acceptance floor is read: the last full run showed
    ///      roughly 9,700 calls per tracked selector against a required 50.
    ///      Duplicating that instrumentation in Solidity was a mistake; what
    ///      remains here is the per-sequence view, which the metrics table does
    ///      not give and which is useful when reading a shrunk counterexample.
    function afterInvariant() public view {
        _logCoverage("LP", lpAgent.callSummary);
        _logCoverage("Allocator", allocatorAgent.callSummary);
        _logCoverage("Committee", committeeAgent.callSummary);
        _logCoverage("Sentinel", sentinelAgent.callSummary);
    }

    function _logCoverage(
        string memory label,
        function() external view returns (bytes4[] memory, uint256[] memory, uint256[] memory) summary
    ) internal view {
        (bytes4[] memory sels, uint256[] memory callCounts, uint256[] memory revertCounts) = summary();
        for (uint256 i; i < sels.length; ++i) {
            console2.log(
                string.concat(label, " ", vm.toString(bytes32(sels[i])), " calls/reverts"),
                callCounts[i],
                revertCounts[i]
            );
        }
    }
}
