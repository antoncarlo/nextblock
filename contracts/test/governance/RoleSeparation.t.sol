// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {RedemptionQueue} from "../../src/RedemptionQueue.sol";
import {NavOracle} from "../../src/NavOracle.sol";

/// @title RoleSeparationTest
/// @author Anton Carlo Santoro
/// @notice Cross-cutting proof of the protocol's headline role-separation
///         invariant: an actor holding ONLY SENTINEL_ROLE can exercise every
///         risk-REDUCTION power (pause / block / freeze) but can NEVER move,
///         allocate, settle or otherwise touch protocol funds. Per-module tests
///         already cover each Sentinel-gated function; this consolidates the
///         "Sentinel can pause but cannot steal" guarantee in one place and
///         asserts fund conservation across every attempted fund-moving call.
contract RoleSeparationTest is Test {
    MockUSDC usdc;
    MockOracle oracle;
    PolicyRegistry registry;
    ClaimReceipt claimReceipt;
    InsuranceVault vault;
    ProtocolRoles roles;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolioRegistry;
    RedemptionQueue queue;
    NavOracle navOracle;

    address admin = makeAddr("admin");
    address managerA = makeAddr("managerA");
    address keeper = makeAddr("keeper"); // ALLOCATOR_ROLE
    address sentinel = makeAddr("sentinel"); // SENTINEL_ROLE ONLY
    address cedant = makeAddr("cedant");
    address lp = makeAddr("lp");

    uint64 constant EPOCH = 7 days;
    uint256 constant DEPOSIT = 100_000e6;
    uint256 portfolioId;

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
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), managerA);
        roles.grantRole(roles.ALLOCATOR_ROLE(), keeper);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinel);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);

        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Reinsurance Vault",
                symbol: "nbRV",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
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
        vault.setVaultAllocator(admin); // admin is the legitimate allocator here

        queue = new RedemptionQueue(address(roles), address(vault), EPOCH);
        compliance.setApprovedVenue(address(queue), true);
        navOracle = new NavOracle(address(roles), address(portfolioRegistry));
        vm.stopPrank();

        // LP funds the vault.
        usdc.mint(lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();

        // An ACTIVE portfolio with real deployed capital the Sentinel must not be
        // able to touch.
        portfolioId = _activePortfolio(60_000e6);
        vm.prank(admin);
        vault.allocateToPortfolio(portfolioId, 40_000e6);
    }

    // --- Sentinel CAN reduce risk everywhere ---

    function test_sentinel_can_reduceRisk() public {
        // Pause the redemption queue.
        vm.prank(sentinel);
        queue.setPaused(true);
        assertTrue(queue.paused(), "queue paused");

        // Block a compliance address (risk reduction, moves no funds).
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        assertTrue(compliance.isBlocked(lp), "lp blocked");

        // Pause a NAV feed.
        vm.prank(sentinel);
        navOracle.pauseFeed(address(vault));
        assertTrue(navOracle.vaultFeedPaused(address(vault)), "feed paused");

        // Pause the active portfolio.
        vm.prank(sentinel);
        portfolioRegistry.pausePortfolio(portfolioId);
        assertEq(
            uint256(portfolioRegistry.getPortfolio(portfolioId).status),
            uint256(PortfolioRegistry.PortfolioStatus.PAUSED),
            "portfolio paused"
        );
    }

    // --- Sentinel CANNOT move funds anywhere ---

    function test_sentinel_cannot_moveFunds() public {
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));
        uint256 lpUsdcBefore = usdc.balanceOf(lp);

        // Cannot allocate vault capital (onlyVaultAllocator).
        vm.prank(sentinel);
        vm.expectRevert();
        vault.allocateToPortfolio(portfolioId, 1_000e6);

        // Cannot release committed capital (onlyVaultAllocator).
        vm.prank(sentinel);
        vm.expectRevert();
        vault.deallocateFromPortfolio(portfolioId, 1_000e6);

        // Cannot settle the redemption queue (ALLOCATOR_ROLE) — drains the vault.
        vm.prank(sentinel);
        vm.expectRevert();
        queue.settleEpoch();

        // Cannot withdraw the LP's assets (no shares, no allowance).
        vm.prank(sentinel);
        vm.expectRevert();
        vault.withdraw(1_000e6, sentinel, lp);

        // Cannot redeem the LP's shares to itself.
        vm.prank(sentinel);
        vm.expectRevert();
        vault.redeem(1e18, sentinel, lp);

        // Conservation: not a single unit of USDC moved.
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore, "vault USDC unchanged");
        assertEq(usdc.balanceOf(lp), lpUsdcBefore, "lp USDC unchanged");
        assertEq(usdc.balanceOf(sentinel), 0, "sentinel gained nothing");
    }

    // --- Sentinel cannot escalate into owner/allocator configuration ---

    function test_sentinel_cannot_configure() public {
        // OWNER_ROLE: change the notice period.
        vm.prank(sentinel);
        vm.expectRevert();
        queue.setEpochDuration(1 days);

        // OWNER_ROLE on the vault: rebind the allocator (would be catastrophic).
        vm.prank(sentinel);
        vm.expectRevert();
        vault.setVaultAllocator(sentinel);
    }

    // --- helpers ---

    function _activePortfolio(uint256 coverage) internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Role-sep treaty",
                metadataURI: "ipfs://rs",
                documentHash: keccak256("rs-doc"),
                lineOfBusiness: "Property",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverage,
                cededPremium: 1,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.startPrank(managerA);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 1000);
        portfolioRegistry.activatePortfolio(pid);
        vm.stopPrank();
    }
}
