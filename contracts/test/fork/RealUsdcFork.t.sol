// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {DeployStack} from "../../script/DeployStack.s.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";

/// @title RealUsdcForkTest
/// @author Anton Carlo Santoro
/// @notice The vault settling in Circle's USDC on Base Sepolia, not in the staging
///         MockUSDC. The mock is a plain ERC-20 that anyone can mint; the real token
///         is a FiatToken proxy with a blacklist, so passing here is the evidence
///         that deposits and withdrawals work against the token the product will
///         actually hold.
///
///         Runs only with a Base Sepolia RPC; it self-skips otherwise (CI has none):
///           BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///             forge test --match-path "test/fork/RealUsdcFork*" -vvv
contract RealUsdcForkTest is Test {
    /// @dev Circle's USDC on Base Sepolia.
    address internal constant CIRCLE_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    /// @dev Recent block, after the token existed. A public RPC prunes old state, so
    ///      refresh this when setUp fails with "state at block N is pruned".
    uint256 internal constant PINNED_BLOCK = 47_560_000;
    /// @dev Anvil default key #0 -- TESTNET PLACEHOLDER, publicly known.
    uint256 internal constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack internal deploy;
    InsuranceVault internal vault;
    ComplianceRegistry internal compliance;

    bool internal forked;

    address internal lp = makeAddr("forkLP");
    address internal kycOperator = makeAddr("forkKycOperator");

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // self-skip in CI

        vm.createSelectFork(rpc, PINNED_BLOCK);
        forked = true;

        deploy = new DeployStack();
        deploy.runWithRoles(
            ANVIL_PK,
            false,
            CIRCLE_USDC,
            DeployStack.RoleConfig({
                owner: makeAddr("forkOwner"),
                curator: makeAddr("forkCurator"),
                sentinel: makeAddr("forkSentinel"),
                committee: makeAddr("forkCommittee"),
                allocatorBot: makeAddr("forkAllocator"),
                oracleNode: makeAddr("forkOracle"),
                cedant: makeAddr("forkCedant"),
                kycOperator: kycOperator
            })
        );
        vault = deploy.vault();
        compliance = deploy.compliance();
    }

    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    function test_Fork_theGenerationSettlesInCircleUsdc() public onlyForked {
        assertEq(block.chainid, 84532, "must run on the Base Sepolia fork");
        assertEq(address(deploy.usdc()), CIRCLE_USDC, "stack asset is Circle's USDC");
        assertEq(vault.asset(), CIRCLE_USDC, "vault settles in Circle's USDC");
        assertEq(IERC20Metadata(CIRCLE_USDC).symbol(), "USDC", "symbol");
        assertEq(IERC20Metadata(CIRCLE_USDC).decimals(), 6, "decimals");
    }

    function test_Fork_anLpDepositsAndWithdrawsRealUsdc() public onlyForked {
        // Eligibility is on-chain; the LP is onboarded by the KYC operator.
        vm.startPrank(kycOperator);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        uint256 amount = 500e6; // 500 USDC
        deal(CIRCLE_USDC, lp, amount);
        assertEq(IERC20(CIRCLE_USDC).balanceOf(lp), amount, "funded with the real token");

        vm.startPrank(lp);
        IERC20(CIRCLE_USDC).approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, lp);
        vm.stopPrank();

        assertGt(shares, 0, "shares minted");
        assertEq(IERC20(CIRCLE_USDC).balanceOf(lp), 0, "the LP's USDC moved into the vault");
        assertEq(vault.totalAssets(), amount, "vault accounts exactly what it received");
        assertEq(IERC20(CIRCLE_USDC).balanceOf(address(vault)), amount, "and holds it");

        // Within the liquidity buffer the exit is instant, so the same real token comes back.
        uint256 instant = vault.maxRedeem(lp);
        assertGt(instant, 0, "some of the position is instantly redeemable");
        vm.prank(lp);
        uint256 assetsOut = vault.redeem(instant, lp, lp);

        assertGt(assetsOut, 0, "assets returned");
        assertEq(IERC20(CIRCLE_USDC).balanceOf(lp), assetsOut, "returned in Circle's USDC");
        assertLe(assetsOut, amount, "never more than was put in");
    }
}
