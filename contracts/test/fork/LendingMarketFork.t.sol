// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployLendingMarket} from "../../script/DeployLendingMarket.s.sol";
import {LendingMarket} from "../../src/lending/LendingMarket.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {NavOracle} from "../../src/NavOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";

/// @title LendingMarketForkTest
/// @author Anton Carlo Santoro
/// @notice Forks the REAL Base Sepolia chain, deploys a fresh NextBlock stack +
///         permissioned lending layer on top of it (via DeployLendingMarket), and
///         exercises a full supply -> collateral -> borrow flow. This validates
///         the deploy path and the lending flow under the real chain id (84532),
///         opcodes and block state.
/// @dev CI-safe: when BASE_SEPOLIA_RPC_URL is unset the tests self-skip. To run:
///
///        BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///          forge test --match-path "test/fork/LendingMarketFork*" -vvv
contract LendingMarketForkTest is Test {
    uint256 internal constant PINNED_BLOCK = 42_720_000;
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 internal constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    DeployLendingMarket internal deploy;
    LendingMarket internal market;
    InsuranceVault internal vault;
    ComplianceRegistry internal compliance;
    NavOracle internal navOracle;
    MockUSDC internal usdc;
    bool internal forked;

    address internal lender = makeAddr("forkLender");
    address internal borrower = makeAddr("forkBorrower");

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // self-skip in CI

        vm.createSelectFork(rpc, PINNED_BLOCK);
        forked = true;

        vm.setEnv("PRIVATE_KEY", vm.toString(ANVIL_PK));
        vm.setEnv("WRITE_DEPLOYMENT_JSON", "false");

        deploy = new DeployLendingMarket();
        deploy.run();

        market = LendingMarket(deploy.market());
        vault = deploy.stack().vault();
        compliance = deploy.stack().compliance();
        navOracle = deploy.stack().navOracle();
        usdc = deploy.stack().usdc();
    }

    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    function _onboard(address who) internal {
        vm.startPrank(ANVIL_DEPLOYER); // holds KYC_OPERATOR on a fresh deploy
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    function test_Fork_deployApprovedVenue() public onlyForked {
        assertEq(block.chainid, 84532, "must run on the Base Sepolia fork");
        assertTrue(compliance.approvedVenue(address(market)), "market venue not approved");
    }

    function test_Fork_supplyCollateralBorrow() public onlyForked {
        // Lender supplies USDC.
        _onboard(lender);
        deal(address(usdc), lender, 100_000e6);
        vm.startPrank(lender);
        usdc.approve(address(market), 100_000e6);
        market.supply(100_000e6);
        vm.stopPrank();

        // Borrower posts nbUSDC collateral.
        _onboard(borrower);
        deal(address(usdc), borrower, 100_000e6);
        vm.startPrank(borrower);
        usdc.approve(address(vault), 100_000e6);
        uint256 shares = vault.deposit(100_000e6, borrower);
        vault.approve(address(market), shares);
        market.depositCollateral(shares);
        vm.stopPrank();

        // Publish NAV (deployer holds ORACLE_ROLE), then borrow within LTV.
        vm.prank(ANVIL_DEPLOYER);
        navOracle.publishNav(address(vault), 100_000e6, 9000, keccak256("fork-nav"));

        vm.prank(borrower);
        market.borrow(50_000e6, borrower);

        assertEq(usdc.balanceOf(borrower), 50_000e6);
        assertApproxEqAbs(market.borrowAssetsOf(borrower), 50_000e6, 1);
        assertTrue(market.isHealthy(borrower));
    }
}
