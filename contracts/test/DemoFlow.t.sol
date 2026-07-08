// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DemoFlow} from "../script/DemoFlow.s.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title DemoFlowTest
/// @notice Phase 12 suite: the end-to-end demo must complete with exact USDC
///         conservation, AVAILABLE lens states, sole claim/allocation paths
///         (bypasses closed), the full NON_PARAMETRIC dispute-window path and
///         bordereau finalization after liveness.
contract DemoFlowTest is Test {
    DemoFlow public demo;

    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function setUp() public {
        demo = new DemoFlow();
        demo.runWithKey(ANVIL_PK, false); // steps 1-12 incl. lens + conservation checks (revert = fail)
    }

    // =========== CONSERVATION (exact, re-asserted independently) ===========

    function test_conservation_exactSplit() public view {
        MockUSDC usdc = demo.usdc();
        address actor = demo.actor();

        // Fresh stack: total supply is exactly what the demo minted.
        assertEq(usdc.totalSupply(), demo.LP_CAPITAL() + demo.PREMIUM());

        // Actor ends with exactly the claim payout.
        assertEq(usdc.balanceOf(actor), demo.CLAIM_AMOUNT());

        // Distributor holds exactly the accrued fees; vault holds the rest.
        uint256 fees = demo.distributor().accruedProtocolFees() + demo.distributor().accruedUnderwritingFees();
        assertEq(usdc.balanceOf(address(demo.distributor())), fees);
        assertEq(
            usdc.balanceOf(address(demo.vault())), demo.LP_CAPITAL() + (demo.PREMIUM() - fees) - demo.CLAIM_AMOUNT()
        );
    }

    // =========== SOLE PATHS (bypasses closed on the LIVE demo stack) ===========

    function test_uniqueAllocationPath_directVaultCallReverts() public {
        address actor = demo.actor(); // holds ALLOCATOR_ROLE — must still be rejected
        InsuranceVault vault = demo.vault();
        uint256 pid = demo.pid(); // hoisted: getters must not consume prank/expectRevert

        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotVaultAllocator.selector, actor));
        vault.allocateToPortfolio(pid, 1_000e6);

        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotVaultAllocator.selector, actor));
        vault.deallocateFromPortfolio(pid, 1_000e6);
    }

    function test_uniqueClaimPath_directVaultCallReverts() public {
        address actor = demo.actor(); // committee + owner + sentinel — still rejected
        InsuranceVault vault = demo.vault();
        uint256 pid = demo.pid(); // hoisted: getters must not consume prank/expectRevert

        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotClaimManager.selector, actor));
        vault.reservePortfolioClaim(99, pid, 1_000e6);

        vm.prank(actor);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotClaimManager.selector, actor));
        vault.payPortfolioClaim(99, pid, actor, 1_000e6);
    }

    // =========== NON_PARAMETRIC PATH (dispute window, institutional default) ===========

    function test_nonParametricClaim_fullDisputeWindowPath() public {
        ClaimManager cm = demo.claimManager();
        address actor = demo.actor();
        address vaultAddr = address(demo.vault()); // hoisted: getters must not
        uint256 pid = demo.pid(); // consume prank/expectRevert
        uint256 amount = 10_000e6;

        vm.prank(actor);
        uint256 claimId =
            cm.submitClaim(vaultAddr, pid, amount, ClaimManager.ClaimType.NON_PARAMETRIC, keccak256("np-evidence"));

        // Committee CANNOT approve before AI assessment + elapsed window
        vm.prank(actor);
        vm.expectRevert(); // InvalidStatus: not ASSESSED yet
        cm.approveClaim(claimId, amount);

        AIAssessor assessor = demo.assessor(); // hoisted
        vm.prank(actor);
        assessor.publishAssessment(
            claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, amount, keccak256("np-ai")
        );
        cm.attachAssessment(claimId);

        // Still challengeable: window active
        uint64 deadline = cm.getClaim(claimId).challengeDeadline; // hoisted
        vm.prank(actor);
        vm.expectRevert(
            abi.encodeWithSelector(ClaimManager.ClaimManager__DisputeWindowActive.selector, claimId, deadline)
        );
        cm.approveClaim(claimId, amount);

        // After the window: committee approves, vault reserves and pays
        vm.warp(block.timestamp + cm.disputeWindow() + 1);
        vm.prank(actor);
        cm.approveClaim(claimId, amount);
        cm.executeClaim(claimId);

        NextBlockLens.ClaimDashboardView memory cd = demo.lens().getClaimDashboard(claimId);
        assertEq(uint8(cd.claim.status), uint8(ClaimManager.ClaimStatus.PAID));

        // Conservation still exact after the second payout
        MockUSDC usdc = demo.usdc();
        uint256 fees = demo.distributor().accruedProtocolFees() + demo.distributor().accruedUnderwritingFees();
        assertEq(
            usdc.balanceOf(demo.actor()) + usdc.balanceOf(address(demo.vault()))
                + usdc.balanceOf(address(demo.distributor())),
            usdc.totalSupply()
        );
        assertEq(usdc.balanceOf(address(demo.distributor())), fees);
    }

    // =========== BORDEREAU FINALIZATION (liveness never skipped) ===========

    function test_bordereau_finalizesOnlyAfterLiveness() public {
        BordereauOracle bo = demo.bordereau();
        uint256 aid = demo.assertionId();

        // Liveness active: finalization rejected, lens reports NONE (no fake data)
        vm.expectRevert();
        bo.finalizeAssertion(aid);
        NextBlockLens.BordereauDashboardView memory bd =
            demo.lens().getBordereauDashboard(demo.pid(), BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(uint8(bd.status), uint8(NextBlockLens.DataStatus.NONE));

        // After liveness: permissionless finalization, lens flips to AVAILABLE
        vm.warp(block.timestamp + bo.liveness() + 1);
        bo.finalizeAssertion(aid);
        bd = demo.lens().getBordereauDashboard(demo.pid(), BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(uint8(bd.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(bd.latestFinalized.declaredAmount, demo.PREMIUM());
    }

    // =========== LENS COHERENCE AFTER THE DEMO ===========

    function test_lens_statesAfterDemo() public view {
        NextBlockLens lens = demo.lens();

        NextBlockLens.ProtocolStatusView memory ps = lens.getProtocolStatus();
        assertEq(ps.vaultCount, 1);
        assertEq(ps.claimCount, 1);
        assertEq(ps.assertionCount, 1);

        // Lens never contradicts the vault (coherence re-check on the demo stack)
        NextBlockLens.VaultDashboardView memory vd = lens.getVaultDashboard(address(demo.vault()));
        (uint256 balance,, uint256 pending,, uint256 allocated,,,) = demo.vault().getVaultAccounting();
        assertEq(vd.balance, balance);
        assertEq(vd.pendingClaims, pending);
        assertEq(vd.portfolioAllocated, allocated);
        assertEq(vd.portfolioAllocated, demo.ALLOCATION() - demo.CLAIM_AMOUNT());
    }
}
