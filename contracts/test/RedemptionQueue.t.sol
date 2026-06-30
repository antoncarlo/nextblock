// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Layer-1 scarcity tests bind `vaultAllocator = admin` and drive
///      `allocateToPortfolio` directly: this drains the vault's free buffer
///      legitimately (via the protocol's own gate) so we can observe the
///      pro-rata path without touching balances out-of-band.

/// @title RedemptionQueueTest
/// @author Anton Carlo Santoro
/// @notice Unit + fuzz coverage for the periodic-window, pro-rata redemption
///         queue. Deterministic paths (request/settle/claim/pause/preview) plus
///         escrow-accounting fuzz. The pro-rata-under-scarcity, cross-module
///         invariant and Base fork layers build on this same harness.
contract RedemptionQueueTest is Test {
    MockUSDC usdc;
    MockOracle oracle;
    PolicyRegistry registry;
    ClaimReceipt claimReceipt;
    InsuranceVault vault;
    ProtocolRoles roles;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolioRegistry;
    RedemptionQueue queue;

    address admin = makeAddr("admin");
    address managerA = makeAddr("managerA");
    address keeper = makeAddr("keeper"); // ALLOCATOR_ROLE
    address sentinel = makeAddr("sentinel"); // SENTINEL_ROLE
    address lp = makeAddr("lp"); // whitelisted Institutional LP
    address lpB = makeAddr("lpB"); // second whitelisted LP (multi-LP scarcity)
    address cedant = makeAddr("cedant"); // AUTHORIZED_CEDANT_ROLE

    uint64 constant EPOCH = 7 days;
    uint256 constant DEPOSIT = 100_000e6; // 100k USDC

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
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        compliance.setWhitelist(lpB, true);
        compliance.setKycExpiry(lpB, uint64(block.timestamp + 3650 days));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), managerA);
        roles.grantRole(roles.ALLOCATOR_ROLE(), keeper);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinel);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                // Fee = 0 so these unit tests isolate the QUEUE math: with no
                // policies/premium (UPR = 0) and no fee accrual, totalAssets ==
                // balance, so an ample-buffer settle is exactly 1:1. Fee/UPR
                // interaction with settlement is covered by the scarcity layer.
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

        queue = new RedemptionQueue(address(roles), address(vault), EPOCH);
        // The queue custodies escrowed nbUSDC: register it as an approved venue.
        compliance.setApprovedVenue(address(queue), true);
        // Self-bind allocator so the scarcity tests can drain the vault buffer
        // through the legitimate gate (no balance manipulation, no mocks).
        vault.setVaultAllocator(admin);
        vm.stopPrank();

        // Fund both LPs and deposit to obtain nbUSDC shares.
        usdc.mint(lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();

        usdc.mint(lpB, DEPOSIT);
        vm.startPrank(lpB);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lpB);
        vm.stopPrank();
    }

    // --- helpers ---
    function _request(uint256 shares) internal {
        vm.startPrank(lp);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();
    }

    function _requestAs(address whom, uint256 shares) internal {
        vm.startPrank(whom);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();
    }

    /// @dev Submit -> review -> approve -> activate a portfolio that can host
    ///      a `coverageLimit` USDC commitment. Used to drain the vault's free
    ///      buffer legitimately via allocateToPortfolio.
    function _createActivePortfolio(uint256 coverageLimit) internal returns (uint256 portfolioId) {
        vm.prank(cedant);
        portfolioId = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Scarcity test treaty",
                metadataURI: "ipfs://test",
                documentHash: keccak256("scarcity-doc"),
                lineOfBusiness: "Property",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverageLimit,
                cededPremium: 1, // metadata only; no premium actually transfers
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.startPrank(managerA);
        portfolioRegistry.startReview(portfolioId);
        portfolioRegistry.approvePortfolio(portfolioId, 1000); // 10% EL
        portfolioRegistry.activatePortfolio(portfolioId);
        vm.stopPrank();
    }

    function _allocate(uint256 portfolioId, uint256 amount) internal {
        vm.prank(admin); // self-bound vaultAllocator
        vault.allocateToPortfolio(portfolioId, amount);
    }

    // --- request ---
    function test_requestRedemption_escrowsShares() public {
        uint256 shares = vault.balanceOf(lp);
        assertGt(shares, 0);
        _request(shares);
        assertEq(vault.balanceOf(lp), 0, "lp shares moved to escrow");
        assertEq(vault.balanceOf(address(queue)), shares, "queue holds escrow");
        assertEq(queue.escrowedShares(), shares, "escrow accounting");
        assertEq(queue.sharesRequested(0, lp), shares, "epoch request recorded");
    }

    function test_requestZero_reverts() public {
        vm.prank(lp);
        vm.expectRevert(RedemptionQueue.RQ__ZeroShares.selector);
        queue.requestRedemption(0);
    }

    // --- settle gating ---
    function test_settleBeforeMaturity_reverts() public {
        _request(vault.balanceOf(lp));
        vm.prank(keeper);
        vm.expectRevert();
        queue.settleEpoch();
    }

    function test_onlyAllocator_canSettle() public {
        _request(vault.balanceOf(lp));
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(lp); // not an allocator
        vm.expectRevert();
        queue.settleEpoch();
    }

    // --- settle full (ample buffer: unallocated vault) ---
    function test_settleAfterMaturity_fullBuffer_settlesAll() public {
        uint256 shares = vault.balanceOf(lp);
        _request(shares);
        vm.warp(block.timestamp + EPOCH + 1);

        vm.prank(keeper);
        queue.settleEpoch();

        (uint256 totalReq, uint256 settledShares, uint256 settledAssets, , bool settled) = queue.epochs(0);
        assertTrue(settled, "epoch settled");
        assertEq(totalReq, shares, "total requested");
        assertEq(settledShares, shares, "all settl