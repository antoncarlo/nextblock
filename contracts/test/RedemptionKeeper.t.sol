// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployRedemptionQueue} from "../script/DeployRedemptionQueue.s.sol";
import {RedemptionKeeper} from "../script/RedemptionKeeper.s.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

/// @title RedemptionKeeperTest
/// @notice Drives the settlement keeper against a freshly deployed stack+queue:
///         it must skip before maturity / when empty, and settle once a matured
///         epoch holds requests.
contract RedemptionKeeperTest is Test {
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    DeployRedemptionQueue deploy;
    RedemptionKeeper keeper;
    RedemptionQueue queue;
    InsuranceVault vault;
    MockUSDC usdc;
    ComplianceRegistry compliance;

    address lp = makeAddr("keeperLp");

    function setUp() public {
        deploy = new DeployRedemptionQueue();
        deploy.runWithConfig(ANVIL_PK, false, 7 days);

        queue = deploy.queue();
        vault = deploy.stack().vault();
        usdc = deploy.stack().usdc();
        compliance = deploy.stack().compliance();
        keeper = new RedemptionKeeper();

        // Onboard an LP (deployer holds KYC_OPERATOR_ROLE) and seed a deposit.
        vm.startPrank(ANVIL_DEPLOYER);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        usdc.mint(lp, 100_000e6);
        vm.startPrank(lp);
        usdc.approve(address(vault), 100_000e6);
        vault.deposit(100_000e6, lp);
        vm.stopPrank();
    }

    function test_keeper_skips_whenNoRequests() public {
        (bool settled, RedemptionKeeper.SkipReason reason) = keeper.settleIfDue(address(queue), ANVIL_PK);
        assertFalse(settled, "nothing to settle");
        assertEq(uint256(reason), uint256(RedemptionKeeper.SkipReason.NO_REQUESTS), "empty epoch");
    }

    function test_keeper_skips_beforeMaturity() public {
        _lpRequestAll();
        (bool settled, RedemptionKeeper.SkipReason reason) = keeper.settleIfDue(address(queue), ANVIL_PK);
        assertFalse(settled, "not matured yet");
        assertEq(uint256(reason), uint256(RedemptionKeeper.SkipReason.NOT_MATURED), "pre-maturity");
    }

    function test_keeper_settles_whenDue() public {
        _lpRequestAll();
        vm.warp(block.timestamp + 7 days + 1);

        (bool settled, RedemptionKeeper.SkipReason reason) = keeper.settleIfDue(address(queue), ANVIL_PK);
        assertTrue(settled, "should settle");
        assertEq(uint256(reason), uint256(RedemptionKeeper.SkipReason.NONE), "settled reason");

        (,,,, bool isSettled) = queue.epochs(0);
        assertTrue(isSettled, "epoch 0 settled");
        assertEq(queue.currentEpochId(), 1, "advanced epoch");

        // A second run is a no-op: epoch 1 is empty.
        (bool settled2, RedemptionKeeper.SkipReason reason2) = keeper.settleIfDue(address(queue), ANVIL_PK);
        assertFalse(settled2, "no double-settle");
        assertEq(uint256(reason2), uint256(RedemptionKeeper.SkipReason.NO_REQUESTS), "next epoch empty");
    }

    function _lpRequestAll() internal {
        uint256 shares = vault.balanceOf(lp);
        vm.startPrank(lp);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();
    }
}
