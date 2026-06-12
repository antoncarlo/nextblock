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

/// @title InsuranceVaultBranchesTest
/// @author Anton Carlo Santoro
/// @notice Targeted branch coverage for guard paths the main suites do not
///         exercise: constructor params, zero-amount reverts on every
///         premium/allocation/claim entry point, claim-reserve underflows,
///         earned-premium boundaries and the expired-policy sweep.
contract InsuranceVaultBranchesTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public allocator = makeAddr("allocator");
    address public cedant = makeAddr("cedant");
    address public claimMgr = makeAddr("claimManager");
    address public lp = makeAddr("institutionalLP");

    uint256 constant BUFFER_2000 = 2000; // 20%
    uint256 constant FEE_50 = 50; // 0.5%
    uint256 constant COVERAGE_50K = 50_000e6;
    uint256 constant PREMIUM_2500 = 2_500e6;
    uint256 constant NINETY_DAYS = 90 days;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocator);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);

        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        vault = new InsuranceVault(_params(address(protocolRoles)));
        claimReceipt.setAuthorizedMinter(address(vault), true);
        vault.setVaultAllocator(allocator);
        vault.setClaimManager(claimMgr);

        usdc.mint(lp, 1_000_000e6);
        usdc.mint(admin, 1_000_000e6);
        vm.stopPrank();
    }

    function _params(address roles_) internal view returns (InsuranceVault.VaultInitParams memory) {
        return InsuranceVault.VaultInitParams({
            asset: IERC20(address(usdc)),
            name: "NextBlock Balanced Core",
            symbol: "nbUSDC-BAL",
            vaultName: "Balanced Core",
            owner: admin,
            vaultManager: managerA,
            bufferRatioBps: BUFFER_2000,
            managementFeeBps: FEE_50,
            registry: address(policyRegistry),
            oracle: address(oracle),
            claimReceipt: address(claimReceipt),
            protocolRoles: roles_,
            complianceRegistry: address(compliance),
            portfolioRegistry: address(portfolioRegistry)
        });
    }

    function _registerPolicy() internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = policyRegistry.registerPolicy(
            "Commercial Fire",
            PolicyRegistry.VerificationType.OFF_CHAIN,
            COVERAGE_50K,
            PREMIUM_2500,
            NINETY_DAYS,
            cedant,
            0
        );
    }

    function _activePolicyInVault() internal returns (uint256 pid) {
        pid = _registerPolicy();
        vm.prank(admin);
        policyRegistry.activatePolicy(pid);
        vm.prank(managerA);
        vault.addPolicy(pid, 4_000);
    }

    function _approvedPortfolio() internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026",
                metadataURI: "ipfs://QmDocs",
                documentHash: keccak256("docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: 100_000e6,
                cededPremium: 10_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.prank(admin);
        portfolioRegistry.startReview(pid);
        vm.prank(admin);
        portfolioRegistry.approvePortfolio(pid, 6_500);
    }

    function _deposit(address who, uint256 amount) internal {
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, who);
        vm.stopPrank();
    }

    // --- Constructor ---

    function test_constructor_revertsOnZeroProtocolRoles() public {
        InsuranceVault.VaultInitParams memory p = _params(address(0));
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        new InsuranceVault(p);
    }

    // --- maxMint ---

    function test_maxMint_unlimitedWithoutCap_thenFiniteWithCap() public {
        assertEq(vault.maxMint(lp), type(uint256).max, "uncapped maxMint is unlimited");

        vm.prank(admin);
        vault.setDepositCap(100_000e6);
        assertLt(vault.maxMint(lp), type(uint256).max, "capped maxMint converts to shares");
    }

    // --- addPolicy guards ---

    function test_addPolicy_revertsOnZeroWeight() public {
        vm.prank(managerA);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.addPolicy(0, 0);
    }

    function test_addPolicy_revertsWhenPolicyNotActive() public {
        uint256 pid = _registerPolicy(); // REGISTERED, never activated
        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PolicyNotActive.selector, pid));
        vault.addPolicy(pid, 4_000);
    }

    // --- Zero-amount guards on premium and allocation entry points ---

    function test_depositPremium_revertsOnZeroAmount() public {
        uint256 pid = _activePolicyInVault();
        vm.prank(admin);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.depositPremium(pid, 0);
    }

    function test_allocateToPortfolio_revertsOnZeroAmount() public {
        vm.prank(allocator);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.allocateToPortfolio(1, 0);
    }

    function test_deallocateFromPortfolio_revertsOnZeroAmount() public {
        vm.prank(allocator);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.deallocateFromPortfolio(1, 0);
    }

    function test_recordPortfolioPremium_revertsOnZeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.recordPortfolioPremium(1, 0);
    }

    function test_recordPortfolioPremium_revertsWhenNotAllocatable() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PortfolioNotAllocatable.selector, 999));
        vault.recordPortfolioPremium(999, 1_000e6);
    }

    // --- Claim reserve guards (claim manager only paths) ---

    function test_reservePortfolioClaim_revertsOnZeroAmount() public {
        vm.prank(claimMgr);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.reservePortfolioClaim(1, 1, 0);
    }

    function test_releasePortfolioClaimReserve_revertsOnZeroAmount() public {
        vm.prank(claimMgr);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.releasePortfolioClaimReserve(1, 1, 0);
    }

    function test_releasePortfolioClaimReserve_revertsOnUnderflow() public {
        vm.prank(claimMgr);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__ClaimReserveUnderflow.selector, 5, 0));
        vault.releasePortfolioClaimReserve(1, 1, 5);
    }

    function test_payPortfolioClaim_revertsOnZeroRecipient() public {
        vm.prank(claimMgr);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.payPortfolioClaim(1, 1, address(0), 5);
    }

    function test_payPortfolioClaim_revertsOnZeroAmount() public {
        vm.prank(claimMgr);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        vault.payPortfolioClaim(1, 1, cedant, 0);
    }

    function test_payPortfolioClaim_revertsOnUnderflow() public {
        vm.prank(claimMgr);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__ClaimReserveUnderflow.selector, 5, 0));
        vault.payPortfolioClaim(1, 1, cedant, 5);
    }

    // --- Earned premium boundaries ---

    function test_earnedPremium_zeroWhenNoPremiumDeposited() public {
        uint256 pid = _activePolicyInVault();
        (, uint256 premium, uint256 earned,,,,,,) = vault.getVaultPolicy(pid);
        assertEq(premium, 0);
        assertEq(earned, 0, "no premium means nothing accrues");
    }

    function test_earnedPremium_fullOnceDurationElapsed() public {
        uint256 pid = _activePolicyInVault();
        vm.startPrank(admin);
        usdc.approve(address(vault), PREMIUM_2500);
        vault.depositPremium(pid, PREMIUM_2500);
        policyRegistry.advanceTime(NINETY_DAYS + 1);
        vm.stopPrank();

        (,, uint256 earned,,,,,,) = vault.getVaultPolicy(pid);
        assertEq(earned, PREMIUM_2500, "full premium earned after expiry");
    }

    // --- Expired-policy sweep (checkExpiredPolicies modifier) ---

    function test_expiredPolicy_sweptOnNextStateChange() public {
        uint256 pid = _activePolicyInVault();

        vm.prank(admin);
        policyRegistry.advanceTime(NINETY_DAYS + 1);

        // Any state-changing call with the modifier triggers the sweep, which
        // walks the expired policy (including the deployed-capital clamp,
        // since totalDeployedCapital is never incremented by current code).
        uint256 pid2 = _registerPolicy();
        vm.prank(admin);
        policyRegistry.activatePolicy(pid2);
        vm.prank(managerA);
        vault.addPolicy(pid2, 1_000);

        (,,,,,, uint256 timeRemaining,, bool expired) = vault.getVaultPolicy(pid);
        assertEq(timeRemaining, 0, "expired policy has no time left");
        assertTrue(expired, "registry reports the policy as expired");
        assertEq(vault.totalDeployedCapital(), 0, "sweep clamps deployed capital at zero");
    }

    // --- Portfolio unearned premium with zero recorded premium ---

    function test_totalAssets_skipsPortfoliosWithoutPremium() public {
        uint256 deposit_ = 100_000e6;
        _deposit(lp, deposit_);
        uint256 portfolioId = _approvedPortfolio();

        vm.prank(allocator);
        vault.allocateToPortfolio(portfolioId, 10_000e6);

        // No premium recorded for the portfolio: unearned must be zero and
        // totalAssets must still equal the LP deposit.
        assertEq(vault.totalAssets(), deposit_, "no phantom premium in NAV");
    }
}
