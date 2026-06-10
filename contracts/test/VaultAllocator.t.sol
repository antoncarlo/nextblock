// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";

/// @title VaultAllocatorTest
/// @notice Phase 6 suite: proposal lifecycle, eligibility races, TTL, concentration
///         limits (portfolio + cedant), advisory oracle guard, vault-as-final-enforcer,
///         demo 70/30 split conservation and double-execution protection.
contract VaultAllocatorTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    NavOracle public navOracle;
    VaultAllocator public allocator;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public allocatorBot = makeAddr("allocatorBot");
    address public cedantA = makeAddr("cedantA");
    address public cedantB = makeAddr("cedantB");
    address public sentinel = makeAddr("sentinel");
    address public oracleNode = makeAddr("oracleNode");
    address public lp = makeAddr("institutionalLP");
    address public attacker = makeAddr("attacker");

    uint256 public pidA; // cedantA
    uint256 public pidA2; // cedantA (second portfolio, same cedant)
    uint256 public pidB; // cedantB

    uint256 constant DEPOSIT_500K = 500_000e6;
    uint256 constant COVERAGE_1M = 1_000_000e6;
    bytes32 constant SOURCE_HASH = keccak256("braino-report");

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        navOracle = new NavOracle(address(protocolRoles), address(portfolioRegistry));
        allocator = new VaultAllocator(
            address(protocolRoles), address(portfolioRegistry), address(navOracle)
        );

        // Roles
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocatorBot);
        // The allocator CONTRACT executes vault calls: it needs the on-chain role too.
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), address(allocator));
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedantA);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedantB);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);

        // LP onboarding
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        // Vault
        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC-BAL",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);

        // Phase 9.5: the vault only accepts allocations from the bound allocator.
        vault.setVaultAllocator(address(allocator));

        usdc.mint(lp, DEPOSIT_500K);
        vm.stopPrank();

        // Portfolios: two for cedantA, one for cedantB
        pidA = _approvedPortfolio(cedantA, "CAT A");
        pidA2 = _approvedPortfolio(cedantA, "Marine A2");
        pidB = _approvedPortfolio(cedantB, "D&O B");

        // LP deposit: investable base = 500K * 80% = 400K
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT_500K);
        vault.deposit(DEPOSIT_500K, lp);
        vm.stopPrank();
    }

    function _approvedPortfolio(address cedant_, string memory name) internal returns (uint256 pid) {
        vm.prank(cedant_);
        pid = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: name,
            metadataURI: "ipfs://QmDocs",
            documentHash: keccak256(bytes(name)),
            lineOfBusiness: "Mixed",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: COVERAGE_1M,
            cededPremium: 50_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 365 days)
        }));
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500); // expectedLossBps mock
        vm.stopPrank();
    }

    function _proposeAndExecute(uint256 pid, uint256 amount) internal returns (uint256 propId) {
        vm.prank(allocatorBot);
        propId = allocator.proposeAllocation(address(vault), pid, amount);
        vm.prank(allocatorBot);
        allocator.executeAllocation(propId);
    }

    // =========== ROLE GATES ===========

    function test_propose_onlyAllocatorRole() public {
        bytes32 allocRole = protocolRoles.ALLOCATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__UnauthorizedRole.selector, attacker, allocRole
        ));
        allocator.proposeAllocation(address(vault), pidA, 10_000e6);
    }

    function test_execute_onlyAllocatorRole() public {
        vm.prank(allocatorBot);
        uint256 propId = allocator.proposeAllocation(address(vault), pidA, 10_000e6);

        bytes32 allocRole = protocolRoles.ALLOCATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__UnauthorizedRole.selector, attacker, allocRole
        ));
        allocator.executeAllocation(propId);
    }

    function test_directVaultAllocation_bypassClosed() public {
        // Phase 9.5: an EOA holding ALLOCATOR_ROLE can no longer call the vault
        // directly — every allocation must pass through the proposal lifecycle.
        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__NotVaultAllocator.selector, allocatorBot
        ));
        vault.allocateToPortfolio(pidA, 10_000e6);
    }

    function test_allocatorContract_holdsNoFunds() public {
        _proposeAndExecute(pidA, 50_000e6);
        // The allocator never custodies USDC
        assertEq(usdc.balanceOf(address(allocator)), 0);
        // Exposure lives in the vault (single source of truth)
        assertEq(vault.portfolioAllocation(pidA), 50_000e6);
    }

    // =========== LIFECYCLE ===========

    function test_proposeExecute_happyPath() public {
        uint64 expectedExpiry = uint64(block.timestamp) + allocator.DEFAULT_PROPOSAL_TTL();
        vm.prank(allocatorBot);
        vm.expectEmit(true, true, true, true);
        emit VaultAllocator.AllocationProposed(
            0, address(vault), pidA, 50_000e6, false, allocatorBot, expectedExpiry
        );
        uint256 propId = allocator.proposeAllocation(address(vault), pidA, 50_000e6);

        vm.prank(allocatorBot);
        vm.expectEmit(true, true, false, true);
        emit VaultAllocator.AllocationExecuted(propId, allocatorBot);
        allocator.executeAllocation(propId);

        assertEq(uint8(allocator.getProposal(propId).status), uint8(VaultAllocator.ProposalStatus.EXECUTED));
        assertEq(vault.portfolioAllocation(pidA), 50_000e6);
    }

    function test_execute_twice_reverts() public {
        uint256 propId = _proposeAndExecute(pidA, 10_000e6);

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__ProposalNotPending.selector,
            propId,
            VaultAllocator.ProposalStatus.EXECUTED
        ));
        allocator.executeAllocation(propId);
    }

    function test_cancel_byProposerAndSentinel() public {
        vm.prank(allocatorBot);
        uint256 p0 = allocator.proposeAllocation(address(vault), pidA, 10_000e6);
        vm.prank(allocatorBot);
        uint256 p1 = allocator.proposeAllocation(address(vault), pidA, 10_000e6);

        // Proposer cancels
        vm.prank(allocatorBot);
        allocator.cancelProposal(p0);
        assertEq(uint8(allocator.getProposal(p0).status), uint8(VaultAllocator.ProposalStatus.CANCELLED));

        // Sentinel cancels (risk action)
        vm.prank(sentinel);
        allocator.cancelProposal(p1);

        // Unauthorized cannot cancel
        vm.prank(allocatorBot);
        uint256 p2 = allocator.proposeAllocation(address(vault), pidA, 10_000e6);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__UnauthorizedCanceller.selector, attacker
        ));
        allocator.cancelProposal(p2);
    }

    function test_ttl_expiryFlow() public {
        vm.prank(allocatorBot);
        uint256 propId = allocator.proposeAllocation(address(vault), pidA, 10_000e6);
        uint64 expiresAt = allocator.getProposal(propId).expiresAt;

        // Cannot mark expired before TTL
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__ProposalNotExpired.selector, propId, expiresAt
        ));
        allocator.markExpired(propId);

        vm.warp(uint256(expiresAt) + 1);

        // Cannot execute after TTL
        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__ProposalExpired.selector, propId, expiresAt
        ));
        allocator.executeAllocation(propId);

        // Permissionless expiry housekeeping
        vm.prank(attacker);
        allocator.markExpired(propId);
        assertEq(uint8(allocator.getProposal(propId).status), uint8(VaultAllocator.ProposalStatus.EXPIRED));
    }

    // =========== ELIGIBILITY ===========

    function test_propose_nonAllocatable_reverts() public {
        vm.prank(cedantA);
        uint256 pidSubmitted = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: "Pending",
            metadataURI: "ipfs://x",
            documentHash: keccak256("pending"),
            lineOfBusiness: "Marine",
            jurisdiction: "UK",
            structureType: PortfolioRegistry.StructureType.XOL,
            coverageLimit: COVERAGE_1M,
            cededPremium: 10_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 365 days)
        }));

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__PortfolioNotAllocatable.selector, pidSubmitted
        ));
        allocator.proposeAllocation(address(vault), pidSubmitted, 10_000e6);
    }

    function test_eligibilityRace_pausedBetweenProposeAndExecute() public {
        vm.prank(allocatorBot);
        uint256 propId = allocator.proposeAllocation(address(vault), pidA, 10_000e6);

        // Portfolio goes ACTIVE then PAUSED between proposal and execution
        vm.prank(admin);
        portfolioRegistry.activatePortfolio(pidA);
        vm.prank(sentinel);
        portfolioRegistry.pausePortfolio(pidA);

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__PortfolioNotAllocatable.selector, pidA
        ));
        allocator.executeAllocation(propId);
    }

    // =========== CONCENTRATION LIMITS ===========

    function test_portfolioConcentration_enforced() public {
        // Base = 400K investable; portfolio limit 40% = 160K
        uint256 base = allocator.investableBase(address(vault));
        assertEq(base, 400_000e6);
        uint256 limit = base * allocator.maxPortfolioConcentrationBps() / 10_000;

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__PortfolioConcentrationExceeded.selector,
            pidA, limit + 1e6, limit
        ));
        allocator.proposeAllocation(address(vault), pidA, limit + 1e6);

        // At the limit: accepted
        _proposeAndExecute(pidA, limit);
        assertEq(vault.portfolioAllocation(pidA), limit);
    }

    function test_cedantConcentration_enforced_acrossPortfolios() public {
        // cedantA has two portfolios; cedant limit 60% of 400K = 240K
        uint256 base = allocator.investableBase(address(vault)); // 400K
        uint256 portfolioLimit = base * allocator.maxPortfolioConcentrationBps() / 10_000; // 160K

        _proposeAndExecute(pidA, portfolioLimit); // cedantA: 160K

        // Second portfolio, same cedant: pushing cedantA to 320K > 240K must revert.
        // NOTE: base shrinks as capacity is consumed; recompute live.
        uint256 baseNow = allocator.investableBase(address(vault));
        uint256 cedantLimitNow = baseNow * allocator.maxCedantConcentrationBps() / 10_000;
        uint256 exposureA = allocator.cedantExposure(address(vault), cedantA);
        uint256 breach = cedantLimitNow - exposureA + 1e6;

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__CedantConcentrationExceeded.selector,
            cedantA, exposureA + breach, cedantLimitNow
        ));
        allocator.proposeAllocation(address(vault), pidA2, breach);

        // Different cedant is unaffected by cedantA's exposure
        vm.prank(allocatorBot);
        allocator.proposeAllocation(address(vault), pidB, 10_000e6);
    }

    function test_setConcentrationLimits_boundsAndGate() public {
        vm.prank(attacker);
        vm.expectRevert();
        allocator.setConcentrationLimits(3_000, 5_000);

        vm.startPrank(admin);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        allocator.setConcentrationLimits(0, 5_000);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        allocator.setConcentrationLimits(5_000, 4_000); // cedant < portfolio

        allocator.setConcentrationLimits(3_000, 5_000);
        vm.stopPrank();

        assertEq(allocator.maxPortfolioConcentrationBps(), 3_000);
        assertEq(allocator.maxCedantConcentrationBps(), 5_000);
    }

    // =========== ORACLE ADVISORY GUARD ===========

    function test_oracle_noAttestation_allocationAllowed() public {
        // Advisory: missing attestation does not block
        _proposeAndExecute(pidA, 10_000e6);
    }

    function test_oracle_freshAttestation_allowed() public {
        vm.prank(oracleNode);
        navOracle.publishNav(address(vault), 500_000e6, 9_000, SOURCE_HASH);
        _proposeAndExecute(pidA, 10_000e6);
    }

    function test_oracle_stale_blocksAllocation() public {
        vm.prank(oracleNode);
        navOracle.publishNav(address(vault), 500_000e6, 9_000, SOURCE_HASH);

        vm.warp(block.timestamp + uint256(navOracle.maxStaleness()) + 1);

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__OracleBlocked.selector, address(vault)
        ));
        allocator.proposeAllocation(address(vault), pidA, 10_000e6);
    }

    function test_oracle_pausedOrAnomalous_blocksAllocation() public {
        vm.prank(sentinel);
        navOracle.pauseFeed(address(vault));

        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            VaultAllocator.VaultAllocator__OracleBlocked.selector, address(vault)
        ));
        allocator.proposeAllocation(address(vault), pidA, 10_000e6);
    }

    function test_oracle_staleDoesNotBlockDeallocation() public {
        _proposeAndExecute(pidA, 50_000e6);

        // Oracle goes stale
        vm.prank(oracleNode);
        navOracle.publishNav(address(vault), 500_000e6, 9_000, SOURCE_HASH);
        vm.warp(block.timestamp + uint256(navOracle.maxStaleness()) + 1);

        // Risk reduction must remain possible
        vm.prank(allocatorBot);
        uint256 propId = allocator.proposeDeallocation(address(vault), pidA, 50_000e6);
        vm.prank(allocatorBot);
        allocator.executeAllocation(propId);
        assertEq(vault.portfolioAllocation(pidA), 0);
    }

    // =========== VAULT REMAINS FINAL ENFORCER ===========

    function test_vaultEnforcesCapacity_revertBubbles() public {
        // Disable allocator-level concentration to isolate the vault check
        vm.prank(admin);
        allocator.setConcentrationLimits(10_000, 10_000);

        uint256 capacity = vault.underwritingCapacity(); // 400K
        vm.prank(allocatorBot);
        uint256 propId = allocator.proposeAllocation(address(vault), pidA, capacity);
        vm.prank(allocatorBot);
        allocator.executeAllocation(propId); // consumes all capacity

        // Next proposal passes allocator guards re-computed on base... base is now
        // allocated-only; concentration disabled; the VAULT must reject on capacity.
        vm.prank(allocatorBot);
        uint256 propId2 = allocator.proposeAllocation(address(vault), pidB, 1e6);
        vm.prank(allocatorBot);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__AllocationExceedsCapacity.selector, 1e6, 0
        ));
        allocator.executeAllocation(propId2);
    }

    // =========== DEMO 70/30 SPLIT ===========

    function test_demoSeventyThirty_split() public {
        uint256 total = 100_000e6;

        vm.prank(allocatorBot);
        uint256[] memory ids = allocator.proposeDemoSeventyThirty(address(vault), pidA, pidB, total);
        assertEq(ids.length, 2);

        VaultAllocator.AllocationProposal memory a = allocator.getProposal(ids[0]);
        VaultAllocator.AllocationProposal memory b = allocator.getProposal(ids[1]);
        assertEq(a.amount, 70_000e6);
        assertEq(b.amount, 30_000e6);
        assertEq(a.amount + b.amount, total); // exact conservation

        vm.startPrank(allocatorBot);
        allocator.executeAllocation(ids[0]);
        allocator.executeAllocation(ids[1]);
        vm.stopPrank();

        assertEq(vault.portfolioAllocation(pidA), 70_000e6);
        assertEq(vault.portfolioAllocation(pidB), 30_000e6);
    }

    function test_split_invalidWeights_revert() public {
        uint256[] memory pids = new uint256[](2);
        pids[0] = pidA;
        pids[1] = pidB;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 7_000;
        weights[1] = 2_000; // sums to 9000 != 10000

        vm.prank(allocatorBot);
        vm.expectRevert(VaultAllocator.VaultAllocator__WeightsMismatch.selector);
        allocator.proposeSplitAllocation(address(vault), pids, weights, 100_000e6);
    }

    // =========== FUZZ ===========

    function testFuzz_split_conservesTotal(uint256 total, uint256 weightA) public {
        total = bound(total, 1e6, 100_000e6);
        weightA = bound(weightA, 1_000, 9_000);

        uint256[] memory pids = new uint256[](2);
        pids[0] = pidA;
        pids[1] = pidB;
        uint256[] memory weights = new uint256[](2);
        weights[0] = weightA;
        weights[1] = 10_000 - weightA;

        vm.prank(allocatorBot);
        uint256[] memory ids = allocator.proposeSplitAllocation(address(vault), pids, weights, total);

        uint256 sum = allocator.getProposal(ids[0]).amount + allocator.getProposal(ids[1]).amount;
        assertEq(sum, total, "split must conserve the total exactly");
    }

    function testFuzz_concentration_neverExceededAfterExecute(uint256 amount) public {
        uint256 base = allocator.investableBase(address(vault));
        uint256 limit = base * allocator.maxPortfolioConcentrationBps() / 10_000;
        amount = bound(amount, 1e6, limit);

        _proposeAndExecute(pidA, amount);

        // Post-execution exposure respects the limit computed at proposal time
        assertLe(vault.portfolioAllocation(pidA), limit);
    }
}
