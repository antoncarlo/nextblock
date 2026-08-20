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
import {VaultAllocator} from "../src/VaultAllocator.sol";

/// @title PassiveBreachTest
/// @author Anton Carlo Santoro
/// @notice The absolute ceiling binds and does not drift; the percentage
///         threshold reports.
///
/// @dev Companion to `ConcentrationDriftRepro`, which characterised the problem:
///      a percentage of a base that shrinks when LPs redeem produces a limit
///      breach nobody caused. These tests cover the answer chosen for it —
///      absolute ceilings as the binding constraint, the percentage kept as a
///      monitored threshold with an explicit passive-breach state.
///
///      The load-bearing property is that an absolute cap does not move when
///      the vault's capital moves. Everything else follows from that.
contract PassiveBreachTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    VaultAllocator internal allocatorC;

    address internal governance = makeAddr("governance");
    address internal curator = makeAddr("curator");
    address internal allocatorKey = makeAddr("allocator");
    address internal cedantKey = makeAddr("cedant");
    address internal kycKey = makeAddr("kyc");
    address internal lp = makeAddr("lp");
    address internal stranger = makeAddr("stranger");

    uint256 internal pid;

    uint256 internal constant DEPOSIT = 1_000_000e6;

    function setUp() public {
        vm.startPrank(governance);
        roles = new ProtocolRoles(governance);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));
        allocatorC = new VaultAllocator(address(roles), address(portfolios), address(0));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.ALLOCATOR_ROLE(), allocatorKey);
        roles.grantRole(roles.ALLOCATOR_ROLE(), address(allocatorC));
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantKey);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "Passive Breach",
                symbol: "nbPB",
                vaultName: "Passive Breach",
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
        vault.setVaultAllocator(address(allocatorC));
        vm.stopPrank();

        vm.startPrank(kycKey);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        pid = _activeBook();
        _fund();
    }

    /// @notice Only the timelock's role may set the ceilings.
    /// @dev Gated on OWNER_ROLE because that is the role the ProtocolTimelock
    ///      holds; routing it there is what makes a ceiling change announced
    ///      rather than instant.
    function test_onlyOwnerRoleMaySetTheCeilings() public {
        // Read outside the pranks: `OWNER_ROLE()` is itself an external call and
        // would consume the prank set for the line below it.
        bytes32 ownerRole = roles.OWNER_ROLE();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(VaultAllocator.VaultAllocator__UnauthorizedRole.selector, stranger, ownerRole)
        );
        allocatorC.setAbsoluteExposureCaps(100_000e6, 200_000e6);

        // The curator holds risk authority but not this lever, on purpose.
        vm.prank(curator);
        vm.expectRevert(
            abi.encodeWithSelector(VaultAllocator.VaultAllocator__UnauthorizedRole.selector, curator, ownerRole)
        );
        allocatorC.setAbsoluteExposureCaps(100_000e6, 200_000e6);

        vm.prank(governance);
        allocatorC.setAbsoluteExposureCaps(100_000e6, 200_000e6);
        assertEq(allocatorC.maxPortfolioExposure(), 100_000e6, "the portfolio ceiling must be recorded");
        assertEq(allocatorC.maxCedantExposure(), 200_000e6, "the cedant ceiling must be recorded");
    }

    /// @notice A cedant ceiling below the portfolio ceiling could never bind.
    function test_ceilingsMustBeOrdered() public {
        vm.prank(governance);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        allocatorC.setAbsoluteExposureCaps(500_000e6, 100_000e6);
    }

    /// @notice Unset ceilings leave behaviour exactly as it was.
    /// @dev Existing deployments have no ceilings configured, and adding this
    ///      must not silently change what they permit.
    function test_unsetCeilingsChangeNothing() public {
        assertEq(allocatorC.maxPortfolioExposure(), 0, "no ceiling is configured by default");

        uint256 amount = _roomUnderPercentageLimits();
        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(vault), pid, amount);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);

        assertEq(vault.portfolioAllocation(pid), amount, "the allocation must go through as before");
    }

    /// @notice The absolute ceiling refuses what the percentage would allow.
    function test_absoluteCeilingBindsBeforeThePercentage() public {
        uint256 room = _roomUnderPercentageLimits();
        uint256 ceiling = room / 2;

        vm.prank(governance);
        allocatorC.setAbsoluteExposureCaps(ceiling, ceiling);

        // The ceilings are checked when the allocation is proposed, not when it
        // is executed, so a refusal never reaches the queue at all.
        vm.prank(allocatorKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultAllocator.VaultAllocator__PortfolioExposureCapExceeded.selector, pid, ceiling + 1, ceiling
            )
        );
        allocatorC.proposeAllocation(address(vault), pid, ceiling + 1);

        // Exactly at the ceiling is inside it.
        vm.prank(allocatorKey);
        uint256 ok = allocatorC.proposeAllocation(address(vault), pid, ceiling);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(ok);
        assertEq(vault.portfolioAllocation(pid), ceiling, "the ceiling itself must be reachable");
    }

    /// @notice The ceiling does not move when LPs redeem. This is the whole point.
    /// @dev The drift reproduction showed a percentage limit falling from
    ///      192,000 to less than the exposure already placed, with no
    ///      allocation in between. The same redemption is run here against an
    ///      absolute ceiling, which is unchanged before and after.
    function test_theAbsoluteCeilingDoesNotDriftOnRedemption() public {
        uint256 ceiling = 250_000e6;
        vm.prank(governance);
        allocatorC.setAbsoluteExposureCaps(ceiling, ceiling);

        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(vault), pid, 200_000e6);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);

        uint256 percentageLimitBefore =
            allocatorC.investableBase(address(vault)) * allocatorC.maxPortfolioConcentrationBps() / 10_000;

        // The LP takes out everything the buffer allows.
        uint256 exiting = vault.maxRedeem(lp);
        vm.prank(lp);
        vault.redeem(exiting, lp, lp);

        uint256 percentageLimitAfter =
            allocatorC.investableBase(address(vault)) * allocatorC.maxPortfolioConcentrationBps() / 10_000;

        assertLt(percentageLimitAfter, percentageLimitBefore, "the percentage limit moved with the base");
        assertEq(allocatorC.maxPortfolioExposure(), ceiling, "the absolute ceiling did not move");
        assertEq(vault.portfolioAllocation(pid), 200_000e6, "and the exposure itself is untouched");
    }

    /// @notice After the redemption the bucket reports a passive breach.
    function test_passiveBreachIsVisibleAfterRedemption() public {
        uint256 placed = _roomUnderPercentageLimits();
        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(vault), pid, placed);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);

        assertFalse(allocatorC.isInPassiveBreach(address(vault), pid), "nothing is breached at the moment of writing");

        uint256 exiting = vault.maxRedeem(lp);
        vm.prank(lp);
        vault.redeem(exiting, lp, lp);

        (bool portfolioBreached,, uint256 excess,) = allocatorC.passiveBreachStatus(address(vault), pid);
        assertTrue(portfolioBreached, "the bucket is above its threshold after the base shrank");
        assertGt(excess, 0, "the excess must be quantified, not merely flagged");
        assertTrue(allocatorC.isInPassiveBreach(address(vault), pid), "the badge must show");
    }

    /// @notice A breaching bucket takes no more, and is not forced to unwind.
    /// @dev The two halves of the chosen policy, asserted together because the
    ///      pair is the policy. Blocking additions without forcing an unwind is
    ///      what distinguishes a passive breach from an active one.
    function test_breachBlocksAdditionsAndForcesNothing() public {
        uint256 placed = _roomUnderPercentageLimits();
        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(vault), pid, placed);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);

        // Redeem most of the buffer but not all of it, so the LP still holds a
        // position afterwards. Without that the exit assertion below would be
        // made about a holder with nothing left to withdraw, and would pass on
        // a vault that had frozen everyone.
        uint256 exiting = vault.maxRedeem(lp) * 9 / 10;
        vm.prank(lp);
        vault.redeem(exiting, lp, lp);
        assertGt(vault.balanceOf(lp), 0, "precondition: the LP still holds a position");
        assertTrue(allocatorC.isInPassiveBreach(address(vault), pid), "precondition: the bucket is in breach");

        // Nothing more may be written to it. The percentage guard already
        // refuses, because current-plus-new is compared against a limit that
        // current alone has passed.
        vm.prank(allocatorKey);
        vm.expectRevert(); // percentage guard: current alone is already past it
        allocatorC.proposeAllocation(address(vault), pid, 1e6);

        // The position stands. No unwind was triggered, and the exposure is
        // exactly what it was before the breach was detected.
        assertEq(vault.portfolioAllocation(pid), placed, "the existing position must not be unwound");

        // And the LP's remaining position is still redeemable. A breach in the
        // book is not a reason to hold an investor's capital, and the exit is
        // asserted as the arithmetic it should be — position against buffer,
        // with the breach appearing nowhere in it.
        (,,,,, uint256 buffer,,) = vault.getVaultAccounting();
        uint256 owed = vault.convertToAssets(vault.balanceOf(lp));
        assertEq(vault.maxWithdraw(lp), owed < buffer ? owed : buffer, "the breach reduced the LP's exit");
        assertFalse(compliance.isBlocked(lp), "no investor was frozen by a concentration breach");
    }

    // --- helpers ---

    function _activeBook() internal returns (uint256 id) {
        vm.prank(cedantKey);
        id = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Breach Book",
                metadataURI: "ipfs://QmBreach",
                documentHash: keccak256("breach"),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: 10_000_000e6,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 3650 days)
            })
        );
        vm.prank(curator);
        portfolios.startReview(id);
        vm.prank(curator);
        portfolios.approvePortfolio(id, 6_500);
        vm.prank(curator);
        portfolios.activatePortfolio(id);
    }

    function _fund() internal {
        usdc.mint(lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();
    }

    /// @dev The largest amount the percentage limits and vault capacity permit,
    ///      so an allocation made here is unimpeachable when it is made.
    function _roomUnderPercentageLimits() internal view returns (uint256 amount) {
        uint256 base = allocatorC.investableBase(address(vault));
        uint256 portfolioCap = base * allocatorC.maxPortfolioConcentrationBps() / 10_000;
        uint256 cedantCap = base * allocatorC.maxCedantConcentrationBps() / 10_000;
        uint256 capacity = vault.underwritingCapacity();

        amount = portfolioCap < cedantCap ? portfolioCap : cedantCap;
        if (capacity < amount) amount = capacity;
    }
}
