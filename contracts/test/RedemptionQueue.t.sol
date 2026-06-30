// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title RedemptionQueueTest
/// @author Anton Carlo Santoro
/// @notice Unit + fuzz coverage for the periodic-window, pro-rata redemption
///         queue. Deterministic paths (request/settle/claim/pause/preview) plus
///         escrow-accounting fuzz. The pro-rata-under-scarcity, cross-module
///         invariant and Base fork layers build on this same harness.
contract RedemptionQueueTest is Test {
    MockUSDC usdc;
    MockOracle oracle;
    PolicyRegistry registry;
    ClaimReceipt claimReceipt;
    InsuranceVault vault;
    ProtocolRoles roles;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolioRegistry;
    RedemptionQueue queue;

    address admin = makeAddr("admin");
    address managerA = makeAddr("managerA");
    address keeper = makeAddr("keeper"); // ALLOCATOR_ROLE
    address sentinel = makeAddr("sentinel"); // SENTINEL_ROLE
    address lp = makeAddr("lp"); // whitelisted Institutional LP

    uint64 constant EPOCH = 7 days;
    uint256 constant DEPOSIT = 100_000e6; // 100k USDC

    function setUp() public {
        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        registry = new PolicyRegistry(address(roles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolioRegistry = new PortfolioRegistry(address(roles));

        roles.grantRole(roles.KYC_OPERATOR_ROLE(), admin);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), managerA);
        roles.grantRole(roles.ALLOCATOR_ROLE(), keeper);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinel);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                // Fee = 0 so these unit tests isolate the QUEUE math: with no
                // policies/premium (UPR = 0) and no fee accrual, totalAssets ==
                // balance, so an ample-buffer settle is exactly 1:1. Fee/UPR
                // interaction with settlement is covered by the scarcity layer.
                managementFeeBps: 0,
                registry: address(registry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);

        queue = new RedemptionQueue(address(roles), address(vault), EPOCH);
        // The queue custodies escrowed nbUSDC: register it as an approved venue.
        compliance.setApprovedVenue(address(queue), true);
        vm.stopPrank();

        // Fund the LP and deposit to obtain nbUSDC shares.
        usdc.mint(lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();
    }

    // --- helpers ---
    function _request(uint256 shares) internal {
        vm.startPrank(lp);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();
    }

    // --- request ---
    function test_requestRedemption_escrowsShares() public {
        uint256 shares = vault.balanceOf(lp);
        assertGt(shares, 0);
        _request(shares);
        assertEq(vault.balanceOf(lp), 0, "lp shares moved to escrow");
        assertEq(vault.balanceOf(address(queue)), shares, "queue holds escrow");
        assertEq(queue.escrowedShares(), shares, "escrow accounting");
        assertEq(queue.sharesRequested(0, lp), shares, "epoch request recorded");
    }

    function test_requestZero_reverts() public {
        vm.prank(lp);
        vm.expectRevert(RedemptionQueue.RQ__ZeroShares.selector);
        queue.requestRedemption(0);
    }

    // --- settle gating ---
    function test_settleBeforeMaturity_reverts() public {
        _request(vault.balanceOf(lp));
        vm.prank(keeper);
        vm.expectRevert();
        queue.settleEpoch();
    }

    function test_onlyAllocator_canSettle() public {
        _request(vault.balanceOf(lp));
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(lp); // not an allocator
        vm.expectRevert();
        queue.settleEpoch();
    }

    // --- settle full (ample buffer: unallocated vault) ---
    function test_settleAfterMaturity_fullBuffer_settlesAll() public {
        uint256 shares = vault.balanceOf(lp);
        _request(shares);
        vm.warp(block.timestamp + EPOCH + 1);

        vm.prank(keeper);
        queue.settleEpoch();

        (uint256 totalReq, uint256 settledShares, uint256 settledAssets,, bool settled) = queue.epochs(0);
        assertTrue(settled, "epoch settled");
        assertEq(totalReq, shares, "total requested");
        assertEq(settledShares, shares, "all settled (buffer ample)");
        assertApproxEqAbs(settledAssets, DEPOSIT, 1, "assets ~= deposit");
        assertEq(queue.currentEpochId(), 1, "advanced epoch");
    }

    // --- claim ---
    function test_claim_paysAssets_andMarksClaimed() public {
        uint256 shares = vault.balanceOf(lp);
        _request(shares);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(keeper);
        queue.settleEpoch();

        uint256 balBefore = usdc.balanceOf(lp);
        vm.prank(lp);
        (uint256 paid, uint256 returned) = queue.claim(0);
        assertApproxEqAbs(paid, DEPOSIT, 1, "claimed ~= deposit");
        assertEq(returned, 0, "nothing returned (full settle)");
        assertEq(usdc.balanceOf(lp) - balBefore, paid, "USDC received");

        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(RedemptionQueue.RQ__AlreadyClaimed.selector, uint256(0)));
        queue.claim(0);
    }

    function test_claim_beforeSettle_reverts() public {
        _request(vault.balanceOf(lp));
        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(RedemptionQueue.RQ__NotSettled.selector, uint256(0)));
        queue.claim(0);
    }

    function test_previewClaim_matchesClaim() public {
        uint256 shares = vault.balanceOf(lp);
        _request(shares);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(keeper);
        queue.settleEpoch();

        (uint256 pvPaid, uint256 pvReturned) = queue.previewClaim(0, lp);
        vm.prank(lp);
        (uint256 paid, uint256 returned) = queue.claim(0);
        assertEq(pvPaid, paid, "preview assets match");
        assertEq(pvReturned, returned, "preview returned match");
    }

    // --- pause (Sentinel) ---
    function test_pause_blocksRequest() public {
        vm.prank(sentinel);
        queue.setPaused(true);
        vm.startPrank(lp);
        vault.approve(address(queue), 1e18);
        vm.expectRevert(RedemptionQueue.RQ__QueuePaused.selector);
        queue.requestRedemption(1e18);
        vm.stopPrank();
    }

    function test_onlySentinel_canPause() public {
        vm.prank(lp);
        vm.expectRevert();
        queue.setPaused(true);
    }

    // --- fuzz: escrow accounting holds for any valid request size ---
    function testFuzz_request_escrowConsistency(uint256 amount) public {
        uint256 shares = vault.balanceOf(lp);
        amount = bound(amount, 1, shares);
        _request(amount);
        assertEq(queue.escrowedShares(), amount);
        assertEq(vault.balanceOf(address(queue)), amount);
        assertEq(queue.sharesRequested(0, lp), amount);
        assertEq(vault.balanceOf(lp), shares - amount);
    }
}
