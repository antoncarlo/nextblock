// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {RedemptionQueue} from "../../src/RedemptionQueue.sol";

/// @title RedemptionQueueHandler
/// @notice Bounded-action handler for stateful invariant testing of the
///         periodic-window pro-rata RedemptionQueue together with the
///         InsuranceVault. Drives deposit / request / allocate / settle /
///         claim sequences across multiple LPs while keeping value
///         in-system (no premium, no claim, no fee accrual in this layer).
contract RedemptionQueueHandler is Test {
    InsuranceVault public vault;
    RedemptionQueue public queue;
    MockUSDC public usdc;
    PortfolioRegistry public portfolioRegistry;

    address public admin;
    address public keeper;
    address public cedant;
    address public managerA;
    address[] public lps;
    uint256[] public portfolioIds;

    uint64 public epochDuration;

    // --- Ghost variables (all monotonically increasing -> no subtractions
    //     inside the handler; invariants assert additive equalities only) ---
    /// @dev Total USDC ever moved INTO the system via LP deposits.
    uint256 public ghost_totalDeposited;
    /// @dev Cumulative shares ever requested across all epochs.
    uint256 public ghost_totalRequested;
    /// @dev Cumulative shares burned by the vault during settle (4626 redeem).
    uint256 public ghost_totalBurned;
    /// @dev Cumulative shares returned from queue back to LPs on claim.
    uint256 public ghost_totalReturned;
    /// @dev Cumulative USDC ever received by the queue from settle redemptions.
    uint256 public ghost_settledAssets;
    /// @dev Cumulative USDC ever paid out by the queue to LPs via claim().
    uint256 public ghost_totalPaid;

    struct HandlerConfig {
        InsuranceVault vault;
        RedemptionQueue queue;
        MockUSDC usdc;
        PortfolioRegistry portfolioRegistry;
        address admin;
        address keeper;
        address cedant;
        address managerA;
        address[] lps;
        uint256[] portfolioIds;
        uint64 epochDuration;
        uint256 initialDeposited; // pre-handler LP deposits, seeds the conservation ghost
    }

    constructor(HandlerConfig memory c) {
        vault = c.vault;
        queue = c.queue;
        usdc = c.usdc;
        portfolioRegistry = c.portfolioRegistry;
        admin = c.admin;
        keeper = c.keeper;
        cedant = c.cedant;
        managerA = c.managerA;
        lps = c.lps;
        portfolioIds = c.portfolioIds;
        epochDuration = c.epochDuration;
        ghost_totalDeposited = c.initialDeposited;
    }

    // --- LP actions ---

    function deposit(uint256 actorSeed, uint256 amount) external {
        address lp = lps[actorSeed % lps.length];
        uint256 maxDep = vault.maxDeposit(lp);
        if (maxDep == 0) return;
        amount = bound(amount, 1e6, 100_000e6);
        if (amount > maxDep) amount = maxDep;

        vm.prank(admin);
        usdc.mint(lp, amount);
        vm.startPrank(lp);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, lp);
        vm.stopPrank();

        ghost_totalDeposited += amount;
    }

    function request(uint256 actorSeed, uint256 sharesSeed) external {
        if (queue.paused()) return;
        address lp = lps[actorSeed % lps.length];
        uint256 bal = vault.balanceOf(lp);
        if (bal == 0) return;
        uint256 shares = bound(sharesSeed, 1, bal);

        vm.startPrank(lp);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();

        ghost_totalRequested += shares;
    }

    function claim(uint256 actorSeed, uint256 epochSeed) external {
        address lp = lps[actorSeed % lps.length];
        uint256 current = queue.currentEpochId();
        if (current == 0) return; // no settled epoch yet (current is open)
        // Choose any epoch in [0, current-1] (all already settled)
        uint256 epochId = epochSeed % current;
        if (queue.sharesRequested(epochId, lp) == 0) return;
        if (queue.claimed(epochId, lp)) return;

        vm.prank(lp);
        (uint256 paid, uint256 returned) = queue.claim(epochId);

        ghost_totalReturned += returned;
        ghost_totalPaid += paid;
    }

    // --- Allocator / keeper actions ---

    /// @dev Drain free buffer through the legitimate portfolio gate to force
    ///      scarcity scenarios at settle time. Capped by underwritingCapacity
    ///      and coverage room so the call never reverts.
    function allocate(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 cap = vault.underwritingCapacity();
        if (cap == 0) return;
        uint256 coverageRoom = portfolioRegistry.getPortfolio(pid).coverageLimit - vault.portfolioAllocation(pid);
        uint256 room = coverageRoom < cap ? coverageRoom : cap;
        if (room == 0) return;
        amount = bound(amount, 1, room);

        vm.prank(admin); // self-bound vaultAllocator
        vault.allocateToPortfolio(pid, amount);
    }

    function deallocate(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 allocated = vault.portfolioAllocation(pid);
        if (allocated == 0) return;
        amount = bound(amount, 1, allocated);

        vm.prank(admin);
        vault.deallocateFromPortfolio(pid, amount);
    }

    /// @dev Advance time past the epoch boundary and settle. Skips when there
    ///      is nothing to settle (no requests in the open epoch) so the run
    ///      can stay revert-free even with empty epochs.
    function warpAndSettle() external {
        if (queue.paused()) return;
        uint256 epochId = queue.currentEpochId();
        (uint256 totalReq,,,, bool settled) = queue.epochs(epochId);
        if (settled) return; // shouldn't happen for the open epoch but guard anyway
        if (totalReq == 0) {
            // Empty epoch: still legal to settle (it's a no-op), but a no-op
            // settle would not progress the ghost state; just warp and skip.
            vm.warp(block.timestamp + uint256(epochDuration) + 1);
            vm.prank(keeper);
            queue.settleEpoch();
            return;
        }
        vm.warp(block.timestamp + uint256(epochDuration) + 1);
        vm.prank(keeper);
        queue.settleEpoch();

        // Read post-settle state and reflect it in ghosts.
        (, uint256 settledShares, uint256 settledAssets,,) = queue.epochs(epochId);
        ghost_totalBurned += settledShares;
        ghost_settledAssets += settledAssets;
    }

    // --- Fuzz helpers ---

    function lpCount() external view returns (uint256) {
        return lps.length;
    }
}

/// @title RedemptionQueueInvariantTest
/// @notice Layer-2: cross-module invariants for the periodic-window queue.
///         Drives multi-LP sequences of deposit / request / allocate /
///         warp+settle / claim and asserts global accounting properties.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 48
/// forge-config: default.invariant.fail-on-revert = true
contract RedemptionQueueInvariantTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    RedemptionQueue public queue;
    RedemptionQueueHandler public handler;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public keeper = makeAddr("keeper");
    address public sentinel = makeAddr("sentinel");
    address public cedant = makeAddr("cedant");

    address[] internal lpsArr;
    uint256[] internal portfolioIdsArr;

    uint64 constant EPOCH = 7 days;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), keeper);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "nb Invariant Queue",
                symbol: "nbUSDC-INV",
                vaultName: "Invariant",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0, // fee=0 -> isolate queue accounting
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);
        vault.setVaultAllocator(admin); // self-bound for handler-driven allocation

        queue = new RedemptionQueue(address(protocolRoles), address(vault), EPOCH);
        compliance.setApprovedVenue(address(queue), true);
        vm.stopPrank();

        // 3 LPs whitelisted + pre-funded for richer fuzz sequences.
        address[3] memory lpSeeds = [makeAddr("lpAlpha"), makeAddr("lpBeta"), makeAddr("lpGamma")];
        for (uint256 i = 0; i < lpSeeds.length; i++) {
            vm.startPrank(admin);
            compliance.setWhitelist(lpSeeds[i], true);
            compliance.setKycExpiry(lpSeeds[i], uint64(block.timestamp + 3650 days));
            usdc.mint(lpSeeds[i], 50_000e6);
            vm.stopPrank();
            vm.startPrank(lpSeeds[i]);
            usdc.approve(address(vault), 50_000e6);
            vault.deposit(50_000e6, lpSeeds[i]);
            vm.stopPrank();
            lpsArr.push(lpSeeds[i]);
        }

        // Two ALLOCATABLE portfolios used by the handler to drain buffer.
        portfolioIdsArr.push(_approvedPortfolio("INV CAT", 200_000e6));
        portfolioIdsArr.push(_approvedPortfolio("INV Marine", 80_000e6));

        handler = new RedemptionQueueHandler(
            RedemptionQueueHandler.HandlerConfig({
                vault: vault,
                queue: queue,
                usdc: usdc,
                portfolioRegistry: portfolioRegistry,
                admin: admin,
                keeper: keeper,
                cedant: cedant,
                managerA: managerA,
                lps: lpsArr,
                portfolioIds: portfolioIdsArr,
                epochDuration: EPOCH,
                initialDeposited: uint256(lpSeeds.length) * 50_000e6
            })
        );

        targetContract(address(handler));
        // Restrict the fuzzer to the 6 handler actions. Without this, Foundry
        // also picks selectors inherited from forge-std/Test (e.g. `bound`,
        // `assume`), which can revert on unconstrained random inputs and trip
        // fail_on_revert = true.
        bytes4[] memory sels = new bytes4[](6);
        sels[0] = RedemptionQueueHandler.deposit.selector;
        sels[1] = RedemptionQueueHandler.request.selector;
        sels[2] = RedemptionQueueHandler.claim.selector;
        sels[3] = RedemptionQueueHandler.allocate.selector;
        sels[4] = RedemptionQueueHandler.deallocate.selector;
        sels[5] = RedemptionQueueHandler.warpAndSettle.selector;
        targetSelector(StdInvariant.FuzzSelector({addr: address(handler), selectors: sels}));
    }

    function _approvedPortfolio(string memory name, uint256 coverage) internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: name,
                metadataURI: "ipfs://Qm",
                documentHash: keccak256(bytes(name)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverage,
                cededPremium: 1_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 3650 days)
            })
        );
        vm.prank(admin);
        portfolioRegistry.startReview(pid);
        vm.prank(admin);
        portfolioRegistry.approvePortfolio(pid, 6_500);
        vm.prank(admin);
        portfolioRegistry.activatePortfolio(pid);
    }

    // -----------------------------------------------------------------
    // INVARIANTS
    // -----------------------------------------------------------------

    /// @notice USDC is conserved across the system: vault + queue + all LPs.
    ///         No premium, no claim payout, no fee bleed in this layer, so
    ///         the system-wide USDC is exactly what LPs ever deposited.
    function invariant_usdcConservation() public view {
        uint256 sum = usdc.balanceOf(address(vault)) + usdc.balanceOf(address(queue));
        for (uint256 i = 0; i < lpsArr.length; i++) {
            sum += usdc.balanceOf(lpsArr[i]);
        }
        assertEq(sum, handler.ghost_totalDeposited(), "USDC not conserved");
    }

    /// @notice nbUSDC accounting holds: shares held by LPs plus shares
    ///         escrowed by the queue equal the total supply.
    function invariant_sharesAccounting() public view {
        uint256 sum = vault.balanceOf(address(queue));
        for (uint256 i = 0; i < lpsArr.length; i++) {
            sum += vault.balanceOf(lpsArr[i]);
        }
        assertEq(sum, vault.totalSupply(), "shares accounting mismatch");
    }

    /// @notice The queue's escrow accounting matches the actual nbUSDC balance
    ///         it custodies (no off-ledger inflation or leak).
    function invariant_escrowMatchesBalance() public view {
        assertEq(queue.escrowedShares(), vault.balanceOf(address(queue)), "escrow mismatch");
    }

    /// @notice Queue-share ledger holds in additive form:
    ///         escrowed + burned-at-settle + returned-on-claim == ever-requested.
    function invariant_queueShareLedger() public view {
        uint256 lhs = vault.balanceOf(address(queue)) + handler.ghost_totalBurned() + handler.ghost_totalReturned();
        assertEq(lhs, handler.ghost_totalRequested(), "queue-share ledger drift");
    }

    /// @notice Queue's USDC balance plus everything ever paid out equals
    ///         everything ever received from settle redemptions. The queue
    ///         can never distribute more USDC than it received.
    function invariant_queueUsdcLedger() public view {
        assertEq(
            usdc.balanceOf(address(queue)) + handler.ghost_totalPaid(),
            handler.ghost_settledAssets(),
            "queue USDC ledger drift"
        );
    }

    /// @notice The vault's totalAssets() never reports more than the USDC it
    ///         physically holds. Sanity check for the NAV formula.
    function invariant_totalAssetsSafe() public view {
        assertLe(vault.totalAssets(), usdc.balanceOf(address(vault)), "totalAssets > balance");
    }
}
