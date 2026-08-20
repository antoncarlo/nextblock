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

/// @title ComplianceExitTest
/// @author Anton Carlo Santoro
/// @notice An investor who loses compliance keeps the right to leave.
///
/// @dev The invariant suite asserts this across random runs, but an invariant
///      that never reaches the state it describes passes without proving
///      anything. These tests reach it deliberately: an LP with capital in the
///      vault, whose KYC then lapses, whose whitelist entry is then withdrawn.
///
///      The distinction being fixed here is the one that carries legal weight
///      rather than technical weight. A withdrawn whitelist entry and an expired
///      KYC date are administrative facts — they must stop the investor from
///      acquiring more, and must not stop them from recovering what they own. A
///      sanctions block is a deliberate freeze and is allowed to shut the exit.
///      A protocol that treats a lapsed date like a sanctions hit has a
///      contractual exposure that no amount of correct accounting repairs, and
///      the professional investors this vault is built for will read the code
///      before they read the marketing.
contract ComplianceExitTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;

    address internal governance = makeAddr("governance");
    address internal curator = makeAddr("curator");
    address internal kycKey = makeAddr("kyc");
    address internal sentinelKey = makeAddr("sentinel");
    address internal lp = makeAddr("lp");

    uint256 internal constant DEPOSIT = 100_000e6;

    function setUp() public {
        vm.startPrank(governance);
        roles = new ProtocolRoles(governance);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinelKey);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "Compliance Exit",
                symbol: "nbEXIT",
                vaultName: "Compliance Exit",
                owner: governance,
                vaultManager: curator,
                bufferRatioBps: 2_000,
                managementFeeBps: 0,
                registry: address(policies),
                oracle: address(oracle),
                claimReceipt: address(receipts),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolios)
            })
        );
        vm.stopPrank();

        vm.startPrank(kycKey);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        usdc.mint(lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();
    }

    /// @notice An expired KYC date shuts the door in and leaves the door out open.
    function test_expiredKycStopsDepositsAndStillPermitsExit() public {
        uint256 shares = vault.balanceOf(lp);
        assertGt(shares, 0, "precondition: the LP holds a position");

        // The paperwork lapses by one second: the smallest expiry that counts,
        // so what is measured is the boundary and not an extreme.
        vm.prank(kycKey);
        compliance.setKycExpiry(lp, uint64(block.timestamp - 1));

        assertFalse(compliance.canReceive(lp), "an expired date must end eligibility");
        assertEq(vault.maxDeposit(lp), 0, "an ineligible holder must not be able to add capital");

        // The exit: not merely non-zero, but the full position, because the
        // buffer holds every asset in this vault — nothing has been underwritten.
        uint256 owed = vault.convertToAssets(shares);
        assertEq(vault.maxWithdraw(lp), owed, "an expired date must not reduce the exit");

        vm.prank(lp);
        uint256 assetsOut = vault.redeem(shares, lp, lp);
        assertEq(assetsOut, owed, "the redemption must pay what the position was worth");
        assertEq(usdc.balanceOf(lp), owed, "the LP must actually hold the USDC");
        assertEq(vault.balanceOf(lp), 0, "the position must be closed");
    }

    /// @notice A withdrawn whitelist entry behaves the same way.
    function test_revokedWhitelistStillPermitsExit() public {
        uint256 shares = vault.balanceOf(lp);

        vm.prank(kycKey);
        compliance.setWhitelist(lp, false);

        assertFalse(compliance.canReceive(lp), "a withdrawn entry must end eligibility");
        assertEq(vault.maxDeposit(lp), 0, "an ineligible holder must not be able to add capital");

        vm.prank(lp);
        uint256 assetsOut = vault.redeem(shares, lp, lp);
        assertGt(assetsOut, 0, "a de-whitelisted holder must still be paid out");
        assertEq(vault.balanceOf(lp), 0, "the position must be closed");
    }

    /// @notice An ineligible holder cannot be sent shares by anyone else either.
    /// @dev Without this the previous two tests would be consistent with a gate
    ///      that only reads `maxDeposit` and never enforces anything on the
    ///      token itself.
    function test_ineligibleHolderCannotReceiveSharesByTransfer() public {
        address other = makeAddr("other_lp");
        vm.startPrank(kycKey);
        compliance.setWhitelist(other, true);
        compliance.setKycExpiry(other, uint64(block.timestamp + 365 days));
        compliance.setKycExpiry(lp, uint64(block.timestamp - 1));
        vm.stopPrank();

        usdc.mint(other, DEPOSIT);
        vm.startPrank(other);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, other);
        vm.expectRevert(
            abi.encodeWithSelector(
                ComplianceRegistry.ComplianceRegistry__KycExpired.selector, lp, uint64(block.timestamp - 1)
            )
        );
        vault.transfer(lp, 1);
        vm.stopPrank();
    }

    /// @notice A sentinel block is the one case that may shut the exit.
    /// @dev The contrast is the point of this file. If this test and the two
    ///      above ever produce the same outcome, the protocol has stopped
    ///      distinguishing a lapsed date from a sanctions hit.
    function test_sentinelBlockIsTheOnlyThingThatShutsTheExit() public {
        uint256 held = vault.balanceOf(lp);

        vm.prank(sentinelKey);
        compliance.setBlocked(lp, true);

        assertEq(vault.maxWithdraw(lp), 0, "a blocked holder must not be able to withdraw");

        // The ERC-4626 ceiling fires before the compliance registry does: a
        // blocked holder's maxRedeem is zero, so the request is refused for
        // exceeding it rather than for the block itself. Asserted as the
        // contract behaves rather than as the domain would phrase it — the
        // funds stay put either way, and a test that describes an error the
        // code does not raise is a test that will mislead the next reader.
        vm.prank(lp);
        vm.expectRevert(
            abi.encodeWithSignature("ERC4626ExceededMaxRedeem(address,uint256,uint256)", lp, held, uint256(0))
        );
        vault.redeem(held, lp, lp);

        // And it is reversible: a block is an incident response, not a
        // confiscation. Lifting it restores the exit in full.
        vm.prank(sentinelKey);
        compliance.setBlocked(lp, false);

        vm.prank(lp);
        uint256 recovered = vault.redeem(held, lp, lp);
        assertGt(recovered, 0, "lifting a block must restore the exit");
        assertEq(vault.balanceOf(lp), 0, "the position must be fully recoverable");
    }
}
