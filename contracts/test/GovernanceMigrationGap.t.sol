// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title GovernanceMigrationGap
/// @author Anton Carlo Santoro
/// @notice What survives `GovernanceMigration`, and what no longer does.
///
///         The script moves exactly two roles on exactly one contract:
///         OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles. It then prints
///         "Governance now flows exclusively through ProtocolTimelock".
///
///         FIXED (F-08): `ClaimReceipt` used to be `Ownable(msg.sender)`, outside
///         the governance model entirely. Its owner held a protocol-wide claim
///         kill-switch — `approveClaim` mints a receipt on every path, so
///         revoking the ClaimManager's authorisation stopped every claim in every
///         vault — which the timelock could neither exercise nor repair. It is
///         now gated on ProtocolRoles.OWNER_ROLE, so the grant the timelock
///         already holds covers it, with no separate migration step to forget.
///         The first two tests are that regression guard, in both directions.
///
///         STILL OPEN (F-10): phase 2 enforces none of its documented
///         preconditions. `docs/GOVERNANCE_PHASE2.md` Stage A — move the
///         operational roles off the deploy key — is prose, not code, and the
///         script neither performs nor verifies it. The last two tests document
///         that. The drain still completes: the claim-vault binding added for
///         F-07 only forces the retired key to route through an allocation it is
///         still authorised to make.
contract GovernanceMigrationGapTest is Test {
    /// @dev Anvil default key #0 — publicly known testnet placeholder.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    ProtocolRoles roles;
    ProtocolTimelock timelock;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolios;
    InsuranceVault vault;
    VaultAllocator allocator;
    ClaimManager claims;
    ClaimReceipt receipts;
    AIAssessor assessor;
    MockUSDC usdc;
    address deployer;

    address safe = makeAddr("protocolSafe");
    address executor = makeAddr("timelockExecutor");
    address lp = makeAddr("institutionalLP");
    address outsider = makeAddr("outsider");

    uint256 constant MIN_DELAY = 1 hours;
    uint256 constant DEPOSIT = 500_000e6;
    uint256 constant COVERAGE = 400_000e6;
    uint256 constant CLAIM = 250_000e6;
    /// @dev Inside the allocator's per-portfolio concentration cap.
    uint256 constant ALLOCATION = 100_000e6;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        roles = deploy.protocolRoles();
        compliance = deploy.compliance();
        portfolios = deploy.portfolioRegistry();
        vault = deploy.vault();
        allocator = deploy.allocator();
        claims = deploy.claimManager();
        receipts = deploy.claimReceipt();
        assessor = deploy.assessor();
        usdc = deploy.usdc();
        deployer = deploy.deployer();

        _runGovernanceMigration();

        // Postcondition the script itself asserts before renouncing.
        assertTrue(roles.hasRole(roles.OWNER_ROLE(), address(timelock)), "timelock owns the protocol");
        assertFalse(roles.hasRole(roles.OWNER_ROLE(), deployer), "deployer renounced OWNER_ROLE");
        assertFalse(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), deployer), "deployer renounced DEFAULT_ADMIN_ROLE");
    }

    /// @notice REGRESSION (F-08): the retired key has no authority over ClaimReceipt.
    /// @dev Before the fix this key could revoke the ClaimManager's minter
    ///      authorisation and brick every claim in the protocol, permanently,
    ///      because ClaimReceipt answered to a private `Ownable` owner the
    ///      migration never transferred.
    function test_retiredDeployerHasNoAuthorityOverClaimReceipt() public {
        assertTrue(receipts.authorizedMinters(address(claims)), "ClaimManager can mint receipts");

        // The key that renounced OWNER_ROLE can no longer touch the claim path.
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedRegistrar.selector, deployer));
        receipts.setAuthorizedMinter(address(claims), false);

        // Nor can anyone else off the street.
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedRegistrar.selector, outsider));
        receipts.setRegistrar(outsider);

        assertTrue(receipts.authorizedMinters(address(claims)), "claim path intact");
    }

    /// @notice REGRESSION (F-08): governance CAN act on ClaimReceipt, and reverse itself.
    /// @dev The other half of the property, and the one a naive fix breaks. A
    ///      kill-switch nobody can reach is as bad as one only a retired key can
    ///      reach: governance must be able to revoke a compromised minter AND
    ///      restore a legitimate one.
    function test_timelockAdministersClaimReceipt() public {
        vm.prank(address(timelock));
        receipts.setAuthorizedMinter(address(claims), false);
        assertFalse(receipts.authorizedMinters(address(claims)), "governance can revoke");

        vm.prank(address(timelock));
        receipts.setAuthorizedMinter(address(claims), true);
        assertTrue(receipts.authorizedMinters(address(claims)), "and restore - no one-way door");

        // Hoisted: an external call in argument position would consume the prank.
        address factoryAddr = address(deploy.factory());
        vm.prank(address(timelock));
        receipts.setRegistrar(factoryAddr);
        assertEq(receipts.registrar(), factoryAddr, "registrar is governance-set");
    }

    /// @notice OPEN (F-10): phase 2 renounces two roles and leaves seven.
    function test_migrationLeavesTheEntireOperationalRoleSetWithTheRetiredKey() public view {
        assertTrue(roles.hasRole(roles.SENTINEL_ROLE(), deployer), "still Sentinel: can pause the protocol");
        assertTrue(roles.hasRole(roles.CLAIMS_COMMITTEE_ROLE(), deployer), "still Claims Committee: approves payouts");
        assertTrue(roles.hasRole(roles.ORACLE_ROLE(), deployer), "still Oracle: publishes NAV and assessments");
        assertTrue(roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), deployer), "still Cedant: can file claims");
        assertTrue(roles.hasRole(roles.KYC_OPERATOR_ROLE(), deployer), "still KYC Operator: controls the whitelist");
        assertTrue(roles.hasRole(roles.ALLOCATOR_ROLE(), deployer), "still Allocator: can put vaults on risk");
        assertTrue(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), deployer), "still Curator: can bind risk");
    }

    /// @notice OPEN (F-10): the retired key still drains an LP vault unaided.
    /// @dev Every role the claim path relies on for its quorum — cedant, oracle,
    ///      committee — is the same address, and so is the allocator. Renouncing
    ///      the admin roles changed none of that. The F-07 binding does bite: the
    ///      key can no longer name an arbitrary funded vault, it must first put
    ///      THIS vault on risk for the portfolio. With ALLOCATOR_ROLE retained,
    ///      that is one extra transaction, not an obstacle.
    function test_retiredDeployerStillDrainsTheVaultEndToEnd() public {
        uint256 before = usdc.balanceOf(deployer);

        (uint256 claimId,) = _liveClaimReadyForApproval(keccak256("loss-b"));

        vm.prank(deployer); // CLAIMS_COMMITTEE_ROLE, retained
        claims.approveClaim(claimId, CLAIM);
        claims.executeClaim(claimId);

        assertEq(usdc.balanceOf(deployer) - before, CLAIM, "retired key walked LP capital out after full migration");
    }

    // --- Helpers ---

    /// @dev Replays `script/GovernanceMigration.s.sol` phase 1 then phase 2.
    function _runGovernanceMigration() internal {
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = executor;

        vm.startPrank(deployer);
        timelock = new ProtocolTimelock(MIN_DELAY, proposers, executors, address(0));
        roles.grantRole(roles.OWNER_ROLE(), address(timelock));
        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock));

        // Phase 2, the step the script calls IRREVERSIBLE.
        roles.renounceRole(roles.OWNER_ROLE(), deployer);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);
        vm.stopPrank();
    }

    /// @dev Funds the vault, puts a portfolio on risk against THIS vault, and
    ///      carries a claim to the point where committee approval is all that is
    ///      left. Every step uses a role the migration left on the deploy key.
    function _liveClaimReadyForApproval(bytes32 evidence) internal returns (uint256 claimId, uint256 pid) {
        // KYC_OPERATOR_ROLE survived, so the retired key can still admit an LP.
        vm.startPrank(deployer);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        usdc.mint(lp, DEPOSIT);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();

        vm.startPrank(deployer); // AUTHORIZED_CEDANT_ROLE, retained
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Retained-key Treaty",
                metadataURI: "ipfs://x",
                documentHash: evidence,
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 20_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        // UNDERWRITING_CURATOR_ROLE, retained.
        portfolios.startReview(pid);
        portfolios.approvePortfolio(pid, 6_500);
        portfolios.activatePortfolio(pid);

        // ALLOCATOR_ROLE, retained: this is what satisfies the F-07 binding.
        // The size is deliberately well inside the allocator's concentration cap —
        // the binding asks whether the vault took the risk, not how much of it, so
        // a modest line is enough to unlock a claim for the full cover.
        uint256 propId = allocator.proposeAllocation(address(vault), pid, ALLOCATION);
        allocator.executeAllocation(propId);

        claimId = claims.submitClaim(address(vault), pid, CLAIM, ClaimManager.ClaimType.NON_PARAMETRIC, evidence);

        // ORACLE_ROLE, retained.
        assessor.publishAssessment(
            claimId,
            8_000,
            1_000,
            9_000,
            AIAssessor.Recommendation.APPROVE,
            CLAIM,
            keccak256(abi.encode(evidence, "ai"))
        );
        vm.stopPrank();

        claims.attachAssessment(claimId);
        vm.warp(block.timestamp + claims.disputeWindow() + 1);
    }
}
