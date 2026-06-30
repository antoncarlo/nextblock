// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {RedemptionQueue} from "../../src/RedemptionQueue.sol";

/// @title RedemptionQueueForkTest
/// @author Anton Carlo Santoro
/// @notice Forks the REAL Base Sepolia chain (id 84532), deploys a minimal
///         NextBlock vault + periodic-window RedemptionQueue on top of it, and
///         exercises the full institutional-exit lifecycle under real chain
///         state: deposit -> request -> warp-to-maturity -> keeper settle ->
///         pro-rata claim. Covers both the ample-buffer (1:1) path and the
///         scarcity path (buffer drained via the portfolio allocation gate,
///         partial pro-rata settle + nbUSDC returned).
/// @dev CI-safe: when BASE_SEPOLIA_RPC_URL is unset the tests self-skip. To run:
///
///        BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///          forge test --match-path "test/fork/RedemptionQueueFork*" -vvv
contract RedemptionQueueForkTest is Test {
    /// @dev Pinned for reproducibility (same block family as LendingMarketFork).
    uint256 internal constant PINNED_BLOCK = 42_720_000;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    uint64 internal constant EPOCH = 7 days;
    uint256 internal constant DEPOSIT = 100_000e6; // 100k USDC per LP

    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimReceipt internal claimReceipt;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    RedemptionQueue internal queue;

    bool internal forked;

    address internal admin = makeAddr("forkAdmin");
    address internal managerA = makeAddr("forkManager");
    address internal keeper = makeAddr("forkKeeper"); // ALLOCATOR_ROLE
    address internal cedant = makeAddr("forkCedant");
    address internal lpA = makeAddr("forkLpA");
    address internal lpB = makeAddr("forkLpB");

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // self-skip in CI

        vm.createSelectFork(rpc, PINNED_BLOCK);
        forked = true;

        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(roles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolioRegistry = new PortfolioRegistry(address(roles));

        roles.grantRole(roles.KYC_OPERATOR_ROLE(), admin);
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), managerA);
        roles.grantRole(roles.ALLOCATOR_ROLE(), keeper);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);

        compliance.setWhitelist(lpA, true);
        compliance.setKycExpiry(lpA, uint64(block.timestamp + 3650 days));
        compliance.setWhitelist(lpB, true);
        compliance.setKycExpiry(lpB, uint64(block.timestamp + 3650 days));

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0, // fee=0 isolates queue accounting on the fork
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);
        vault.setVaultAllocator(admin); // self-bound to drain buffer via the legit gate

        queue = new RedemptionQueue(address(roles), address(vault), EPOCH);
        compliance.setApprovedVenue(address(queue), true);
        vm.stopPrank();

        _fundAndDeposit(lpA);
        _fundAndDeposit(lpB);
    }

    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    // --- helpers ---

    function _fundAndDeposit(address who) internal {
        vm.prank(admin);
        usdc.mint(who, DEPOSIT);
        vm.startPrank(who);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, who);
        vm.stopPrank();
    }

    function _request(address who, uint256 shares) internal {
        vm.startPrank(who);
        vault.approve(address(queue), shares);
        queue.requestRedemption(shares);
        vm.stopPrank();
    }

    function _drainBuffer(uint256 amount) internal {
        vm.prank(cedant);
        uint256 pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Fork treaty",
                metadataURI: "ipfs://fork",
                documentHash: keccak256("fork-doc"),
                lineOfBusiness: "Property",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: amount,
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
        vm.prank(admin);
        vault.allocateToPortfolio(pid, amount);
    }

    // --- tests ---

    /// @notice Sanity: we are really on the Base Sepolia fork.
    function test_Fork_chainId() public onlyForked {
        assertEq(block.chainid, BASE_SEPOLIA_CHAIN_ID, "must run on the Base Sepolia fork");
        assertTrue(compliance.approvedVenue(address(queue)), "queue venue not approved");
    }

    /// @notice Ample-buffer exit: single LP redeems fully 1:1 through the queue.
    function test_Fork_fullBuffer_settlesAndClaims() public onlyForked {
        uint256 shares = vault.balanceOf(lpA);
        _request(lpA, shares);

        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(keeper);
        queue.settleEpoch();

        (, uint256 settledShares, uint256 settledAssets,, bool settled) = queue.epochs(0);
        assertTrue(settled, "settled");
        assertEq(settledShares, shares, "full settle");
        assertApproxEqAbs(settledAssets, DEPOSIT, 1, "assets ~= deposit");

        uint256 bal0 = usdc.balanceOf(lpA);
        vm.prank(lpA);
        (uint256 paid, uint256 returned) = queue.claim(0);
        assertApproxEqAbs(paid, DEPOSIT, 1, "claimed ~= deposit");
        assertEq(returned, 0, "nothing returned");
        assertEq(usdc.balanceOf(lpA) - bal0, paid, "USDC delivered");
    }

    /// @notice Scarcity exit on the real chain: buffer drained to 25% of the two
    ///         LPs' combined request, settle is partial and pro-rata, the
    ///         unsettled remainder returns as nbUSDC. Mirrors the unit/invariant
    ///         layers but validates the path under chain id 84532.
    function test_Fork_scarcity_prorata() public onlyForked {
        uint256 sharesA = vault.balanceOf(lpA);
        uint256 sharesB = vault.balanceOf(lpB);
        _request(lpA, sharesA);
        _request(lpB, sharesB);
        uint256 totalReq = sharesA + sharesB;

        // Vault holds 200k USDC; drain 150k -> available buffer = 50k = 25%.
        _drainBuffer(150_000e6);

        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(keeper);
        queue.settleEpoch();

        uint256 settledShares;
        uint256 settledAssets;
        {
            bool settled;
            (, settledShares, settledAssets,, settled) = queue.epochs(0);
            assertTrue(settled, "settled");
            assertLt(settledShares, totalReq, "partial settle");
            assertApproxEqAbs(settledAssets, 50_000e6, 1, "assets ~= buffer");
        }

        uint256 paidA;
        uint256 retA;
        vm.prank(lpA);
        (paidA, retA) = queue.claim(0);
        uint256 paidB;
        uint256 retB;
        vm.prank(lpB);
        (paidB, retB) = queue.claim(0);

        // Symmetric LPs -> identical pro-rata, order-independent.
        assertEq(paidA, paidB, "equal USDC pro-rata");
        assertEq(retA, retB, "equal shares returned");
        assertGt(retA, 0, "partial: shares returned");

        // Conservation under real chain state.
        assertLe(paidA + paidB, settledAssets, "no USDC over-pay");
        assertApproxEqAbs(paidA + paidB, settledAssets, 1, "USDC ~= settled");
        // Returned shares + settled = requested (last-claimer dust absorbed by
        // the contract fix; tolerance 1 wei nbUSDC for the floor rounding).
        assertApproxEqAbs(retA + retB + settledShares, totalReq, 1, "shares conserved");
        assertEq(queue.escrowedShares(), 0, "queue drained");
        assertEq(usdc.balanceOf(address(queue)), 0, "no USDC stranded");
    }
}
