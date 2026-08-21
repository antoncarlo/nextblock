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

/// @notice A contract account, in the shape a real institutional LP arrives in.
/// @dev Not a full Safe or ERC-4337 account: what matters for this file is that
///      it is a contract rather than an EOA, that it holds its own assets, and
///      that every call the vault sees comes from `address(this)` with no
///      signature involved. A faithful Safe would add owners and thresholds
///      that the vault never observes.
contract SmartAccountLp {
    function approve(IERC20 token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function deposit(InsuranceVault vault, uint256 assets) external returns (uint256) {
        return vault.deposit(assets, address(this));
    }

    function redeem(InsuranceVault vault, uint256 shares) external returns (uint256) {
        return vault.redeem(shares, address(this), address(this));
    }

    function transferShares(InsuranceVault vault, address to, uint256 shares) external returns (bool) {
        return vault.transfer(to, shares);
    }
}

/// @title SmartAccountLpTest
/// @author Anton Carlo Santoro
/// @notice Whether an institutional LP can subscribe from a contract account.
///
/// @dev The frontend offers the default wallet connectors, so a real fund can
///      arrive as a Coinbase Smart Wallet, a Safe, or an ERC-4337 account.
///      Neither the vault nor ComplianceRegistry distinguishes a contract from
///      an externally owned account, and neither implements ERC-1271 — so
///      whether that path works is a question nobody had asked, and every LP in
///      the test suite up to now has been an EOA.
///
///      A gap that is only discovered when a fund tries to deposit from its
///      treasury Safe is discovered in front of the fund. These tests ask the
///      question while it is still cheap.
contract SmartAccountLpTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;

    SmartAccountLp internal smartLp;
    SmartAccountLp internal uninvitedLp;

    address internal governance = makeAddr("governance");
    address internal curator = makeAddr("curator");
    address internal kycKey = makeAddr("kyc");
    address internal eoaLp = makeAddr("eoa_lp");

    uint256 internal constant DEPOSIT = 250_000e6;

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

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "Smart Account",
                symbol: "nbSA",
                vaultName: "Smart Account",
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

        smartLp = new SmartAccountLp();
        uninvitedLp = new SmartAccountLp();

        // Onboarded exactly like an EOA would be, because that is what an
        // operator would do and nothing in the interface suggests otherwise.
        vm.startPrank(kycKey);
        compliance.setWhitelist(address(smartLp), true);
        compliance.setKycExpiry(address(smartLp), uint64(block.timestamp + 365 days));
        compliance.setWhitelist(eoaLp, true);
        compliance.setKycExpiry(eoaLp, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        usdc.mint(address(smartLp), DEPOSIT);
        usdc.mint(eoaLp, DEPOSIT);
    }

    /// @notice A whitelisted contract account can subscribe.
    function test_contractAccountCanSubscribe() public {
        smartLp.approve(IERC20(address(usdc)), address(vault), DEPOSIT);
        uint256 shares = smartLp.deposit(vault, DEPOSIT);

        assertGt(shares, 0, "a contract account must be able to take a position");
        assertEq(vault.balanceOf(address(smartLp)), shares, "and must hold the shares itself");
        assertEq(usdc.balanceOf(address(smartLp)), 0, "and must have paid for them");
    }

    /// @notice A contract account is priced exactly like an EOA.
    /// @dev The comparison is the assertion. If contract accounts were handled
    ///      anywhere in the share arithmetic — through a hook, a callback or a
    ///      different code path — the two would diverge, and a fund would be
    ///      quietly buying at a different price than an individual.
    function test_contractAndEoaAreQuotedTheSame() public {
        smartLp.approve(IERC20(address(usdc)), address(vault), DEPOSIT);
        uint256 contractShares = smartLp.deposit(vault, DEPOSIT);

        vm.startPrank(eoaLp);
        usdc.approve(address(vault), DEPOSIT);
        uint256 eoaShares = vault.deposit(DEPOSIT, eoaLp);
        vm.stopPrank();

        // The second depositor enters against a larger book, so exact equality
        // would be wrong. What must hold is that the difference comes from the
        // book having grown and not from who was asking.
        assertApproxEqRel(contractShares, eoaShares, 1e15, "a contract account was quoted differently from an EOA");
    }

    /// @notice A contract account can leave.
    /// @dev The half that would be expensive to get wrong. Subscribing from a
    ///      Safe and then discovering the exit assumes an EOA would trap a
    ///      fund's capital in a way no amount of correct accounting repairs.
    function test_contractAccountCanRedeem() public {
        smartLp.approve(IERC20(address(usdc)), address(vault), DEPOSIT);
        uint256 shares = smartLp.deposit(vault, DEPOSIT);

        uint256 out = smartLp.redeem(vault, shares);
        assertGt(out, 0, "a contract account must be able to exit");
        assertEq(vault.balanceOf(address(smartLp)), 0, "the position must close");
        assertEq(usdc.balanceOf(address(smartLp)), out, "and the assets must arrive at the contract");
    }

    /// @notice The compliance gate applies to contract accounts too.
    function test_anUninvitedContractIsRefused() public {
        usdc.mint(address(uninvitedLp), DEPOSIT);
        uninvitedLp.approve(IERC20(address(usdc)), address(vault), DEPOSIT);

        // The ERC-4626 ceiling fires before the registry does: maxDeposit is
        // zero for an ineligible receiver, so the request is refused for
        // exceeding it rather than for the whitelist. Asserted as the contract
        // behaves rather than as the domain would phrase it — the deposit is
        // refused either way, and a test describing an error the code does not
        // raise will mislead whoever reads it next.
        vm.expectRevert(
            abi.encodeWithSignature(
                "ERC4626ExceededMaxDeposit(address,uint256,uint256)", address(uninvitedLp), DEPOSIT, uint256(0)
            )
        );
        uninvitedLp.deposit(vault, DEPOSIT);

        assertFalse(compliance.canReceive(address(uninvitedLp)), "and the registry is the reason underneath");
    }

    /// @notice Shares move between a contract account and an EOA in both directions.
    function test_sharesMoveBetweenAccountKinds() public {
        smartLp.approve(IERC20(address(usdc)), address(vault), DEPOSIT);
        uint256 shares = smartLp.deposit(vault, DEPOSIT);

        smartLp.transferShares(vault, eoaLp, shares / 2);
        assertEq(vault.balanceOf(eoaLp), shares / 2, "a contract must be able to send to an EOA");

        vm.prank(eoaLp);
        vault.transfer(address(smartLp), shares / 4);
        assertEq(vault.balanceOf(address(smartLp)), shares - shares / 2 + shares / 4, "and receive from one");
    }

    /// @notice An approved venue holds shares without a whitelist entry; a
    ///         plain contract does not.
    /// @dev Worth separating because the two look alike from outside and are
    ///      not. `approvedVenue` exists for custody contracts that have no KYC
    ///      to expire — it is not a general exemption for smart accounts, and
    ///      reading it as one would put every ERC-4337 wallet outside the gate.
    function test_approvedVenueIsNotAGeneralExemptionForContracts() public {
        assertFalse(compliance.canReceive(address(uninvitedLp)), "a plain contract is not eligible by being a contract");

        // Gated on the KYC operator rather than on governance: approving a
        // custody venue is an onboarding decision, and it sits with the role
        // that makes the other onboarding decisions.
        vm.prank(kycKey);
        compliance.setApprovedVenue(address(uninvitedLp), true);

        assertTrue(
            compliance.canReceive(address(uninvitedLp)), "an approved venue is eligible without a whitelist entry"
        );
        assertFalse(compliance.whitelisted(address(uninvitedLp)), "and it got there without one");
    }

    /// @notice A whitelisted account with no KYC date set is not eligible.
    /// @dev The onboarding mistake this catches is easy to make and silent: an
    ///      operator whitelists a fund's Safe, sets no expiry, and the deposit
    ///      fails with a message about KYC that the operator believes was never
    ///      required. An unset date is zero, and zero is in the past.
    function test_whitelistWithoutAnExpiryIsNotEnough() public {
        SmartAccountLp halfOnboarded = new SmartAccountLp();

        vm.prank(kycKey);
        compliance.setWhitelist(address(halfOnboarded), true);

        assertFalse(compliance.canReceive(address(halfOnboarded)), "a whitelist entry alone does not admit an investor");
    }
}
