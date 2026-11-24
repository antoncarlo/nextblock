// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {SeedVault} from "../script/SeedVault.s.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

/// @dev A 6 decimal asset with no public mint, standing in for a real USDC.
contract NoMintUsdc is ERC20 {
    constructor(address holder, uint256 amount) ERC20("Real USDC stand-in", "rUSDC") {
        _mint(holder, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @title SeedVaultTest
/// @notice The first test capital goes in through the normal deposit path, under the vault's own
///         limits, and never makes anyone eligible or funded by accident.
contract SeedVaultTest is Test {
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant LP_PK = 0xA11CE;

    DeployStack internal deploy;
    SeedVault internal seeder;
    InsuranceVault internal vault;
    MockUSDC internal usdc;
    ComplianceRegistry internal compliance;
    address internal lp;
    address internal deployer;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));
        seeder = new SeedVault();
        vault = deploy.vault();
        usdc = deploy.usdc();
        compliance = deploy.compliance();
        lp = vm.addr(LP_PK);
        deployer = vm.addr(ANVIL_PK);
    }

    function _eligible(address who) internal {
        vm.startPrank(deployer);
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    /// @dev The local stack settles in a test token funded with `deal`; the script itself never mints.
    function test_seedsTheDefaultAmountThroughTheNormalDepositPath() public {
        _eligible(deployer);
        deal(address(usdc), deployer, 120_000e6);
        uint256 assetsBefore = vault.totalAssets();

        SeedVault.Result memory r = seeder.runWith(ANVIL_PK, address(vault), seeder.DEFAULT_SEED(), false);

        assertEq(r.assetsDeposited, 120_000e6);
        assertGt(r.sharesMinted, 0);
        assertEq(vault.balanceOf(deployer), r.sharesMinted);
        assertEq(vault.totalAssets(), assetsBefore + 120_000e6);
        assertEq(r.totalAssetsAfter, vault.totalAssets());
        assertGe(vault.totalAssets(), 100_000e6, "at least the 100K target");
    }

    function test_refusesAnIneligibleLpWithoutTheOptIn() public {
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__LpNotEligible.selector, deployer));
        seeder.runWith(ANVIL_PK, address(vault), 100_000e6, false);
    }

    function test_optInWhitelistsTheLpThroughItsOwnOperatorRole() public {
        // The deployer holds KYC_OPERATOR_ROLE on a fresh stack.
        deal(address(usdc), deployer, 100_000e6);
        SeedVault.Result memory r = seeder.runWith(ANVIL_PK, address(vault), 100_000e6, true);
        assertTrue(compliance.canReceive(deployer));
        assertGt(r.sharesMinted, 0);
    }

    function test_optInFailsForABroadcasterWithoutTheOperatorRole() public {
        vm.expectRevert();
        seeder.runWith(LP_PK, address(vault), 100_000e6, true);
    }

    function test_neverMintsOnAnAssetItCannotMint() public {
        // A settlement asset with no public mint, as a real USDC: a shortfall is an error that
        // names the amounts, never a silent mint.
        NoMintUsdc real = new NoMintUsdc(makeAddr("holder"), 20e6);
        DeployStack realDeploy = new DeployStack();
        realDeploy.runWithConfig(ANVIL_PK, false, address(real));
        InsuranceVault realVault = realDeploy.vault();
        ComplianceRegistry realCompliance = realDeploy.compliance();

        vm.startPrank(deployer);
        realCompliance.setWhitelist(deployer, true);
        realCompliance.setKycExpiry(deployer, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        vm.expectRevert(
            abi.encodeWithSelector(SeedVault.SeedVault__InsufficientAsset.selector, deployer, 0, uint256(120_000e6))
        );
        seeder.runWith(ANVIL_PK, address(realVault), 120_000e6, false);
    }

    function test_respectsTheVaultDepositLimits() public {
        _eligible(deployer);
        vm.prank(deployer);
        compliance.setInvestorLimit(deployer, 50_000e6);
        deal(address(usdc), deployer, 100_000e6);
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__ExceedsMaxDeposit.selector, 100_000e6, 50_000e6));
        seeder.runWith(ANVIL_PK, address(vault), 100_000e6, false);
    }

    function test_boundsTheSeed() public {
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__SeedOutOfBounds.selector, 0, 1_000_000e6));
        seeder.runWith(ANVIL_PK, address(vault), 0, false);
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__SeedOutOfBounds.selector, 1_000_001e6, 1_000_000e6));
        seeder.runWith(ANVIL_PK, address(vault), 1_000_001e6, false);
    }

    function test_refusesAnUnsupportedChainAndANonVault() public {
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__NoCode.selector, address(0xBEEF)));
        seeder.runWith(ANVIL_PK, address(0xBEEF), 100_000e6, false);

        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(SeedVault.SeedVault__UnsupportedChain.selector, 8453));
        seeder.runWith(ANVIL_PK, address(vault), 100_000e6, false);
    }
}
