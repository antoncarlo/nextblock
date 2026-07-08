// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployLendingMarket} from "../script/DeployLendingMarket.s.sol";
import {LendingMarketFactory} from "../src/lending/LendingMarketFactory.sol";
import {LendingMarket} from "../src/lending/LendingMarket.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

/// @title DeployLendingMarketTest
/// @notice Full-stack-plus-lending deploy on the local chain (31337): factory,
///         one market for the deployed vault, and the KYC-operator venue approval.
contract DeployLendingMarketTest is Test {
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployLendingMarket deploy;

    function setUp() public {
        deploy = new DeployLendingMarket();
    }

    function test_run_deploysWiresAndApprovesMarket() public {
        deploy.runWithConfig(ANVIL_PK, false);

        LendingMarketFactory factory = deploy.factory();
        address market = deploy.market();

        // Factory tracked the market.
        assertTrue(factory.isMarket(market));
        assertEq(factory.getMarketCount(), 1);

        // Market wired to the deployed stack.
        LendingMarket m = LendingMarket(market);
        assertEq(address(m.loanToken()), address(deploy.stack().usdc()));
        assertEq(address(m.collateralToken()), address(deploy.stack().vault()));
        assertEq(m.lltvBps(), 7000);
        assertEq(m.liqLtvBps(), 8000);

        // Venue approved so the market may custody nbUSDC.
        ComplianceRegistry compliance = deploy.stack().compliance();
        assertTrue(compliance.approvedVenue(market));
    }

    function test_run_rejectsUnexpectedChain() public {
        // The underlying stack guards the chain: mainnet must be refused.
        vm.chainId(1);
        vm.expectRevert();
        deploy.runWithConfig(ANVIL_PK, false);
    }
}
