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

/// @title ConcentrationDriftRepro
/// @author Anton Carlo Santoro
/// @notice Deterministic reproduction of the first finding produced by the
///         multi-agent invariant suite: concentration limits are enforced when
///         capital is deployed and never revisited when capital leaves.
/// @dev The invariant run shrank to three actions — deposit, allocate, redeem —
///      and this restates them with fixed numbers so the behaviour can be read
///      without a fuzzer.
///
///      The mechanism is not a broken check. `_checkAllocationGuards` compares
///      exposure against a percentage of `investableBase`, and it is correct at
///      the moment it runs. The base is a function of vault capital, so a
///      redemption shrinks it afterwards, and an allocation that was inside the
///      cap when made can sit outside it a block later without anything having
///      been violated at the time.
///
///      Whether that is acceptable is a risk decision, not a code question. It
///      is recorded here rather than argued: the numbers below are what the
///      protocol does today.
contract ConcentrationDriftReproTest is Test {
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

    uint256 internal pid;

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
                name: "Drift Repro",
                symbol: "nbDRIFT",
                vaultName: "Drift Repro",
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

        vm.prank(cedantKey);
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Drift Portfolio",
                metadataURI: "ipfs://QmDrift",
                documentHash: keccak256("drift"),
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
        portfolios.startReview(pid);
        vm.prank(curator);
        portfolios.approvePortfolio(pid, 6_500);
    }

    /// @notice Exposure that was compliant when deployed sits above the cedant
    ///         cap once an LP redeems, with no further allocation.
    function test_concentrationDriftsAboveCapAfterRedemption() public {
        // 1. An LP funds the vault.
        uint256 deposited = 1_000_000e6;
        usdc.mint(lp, deposited);
        vm.startPrank(lp);
        usdc.approve(address(vault), deposited);
        vault.deposit(deposited, lp);
        vm.stopPrank();

        // 2. The allocator deploys as much as the cedant cap permits.
        uint256 baseBefore = allocatorC.investableBase(address(vault));
        uint256 cedantCap = baseBefore * allocatorC.maxCedantConcentrationBps() / 10_000;
        // The per-portfolio cap (40%) binds before the per-cedant one (60%),
        // and the vault's own capacity binds before either. Deploy the largest
        // amount all three permit, so the allocation is unimpeachable when made.
        uint256 portfolioCap = baseBefore * allocatorC.maxPortfolioConcentrationBps() / 10_000;
        uint256 capacity = vault.underwritingCapacity();
        uint256 amount = portfolioCap < cedantCap ? portfolioCap : cedantCap;
        if (capacity < amount) amount = capacity;

        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(vault), pid, amount);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);

        uint256 exposure = allocatorC.cedantExposure(address(vault), cedantKey);
        assertLe(exposure, cedantCap, "precondition: within the cedant cap when made");
        assertLe(vault.portfolioAllocation(pid), portfolioCap, "precondition: within the portfolio cap when made");

        // 3. The LP redeems everything the free buffer allows. No allocation
        //    happens here, and no guard is bypassed — the base simply shrinks.
        uint256 redeemable = vault.maxRedeem(lp);
        assertGt(redeemable, 0, "precondition: something is redeemable");
        vm.prank(lp);
        vault.redeem(redeemable, lp, lp);

        // 4. The same exposure now measures against a smaller base.
        uint256 baseAfter = allocatorC.investableBase(address(vault));
        uint256 capAfter = baseAfter * allocatorC.maxCedantConcentrationBps() / 10_000;
        uint256 exposureAfter = allocatorC.cedantExposure(address(vault), cedantKey);

        assertLt(baseAfter, baseBefore, "the redemption shrank the investable base");
        assertEq(exposureAfter, exposure, "no allocation occurred in between");
        assertGt(exposureAfter, capAfter, "FINDING: exposure now exceeds the cedant cap");

        emit log_named_uint("investable base before", baseBefore);
        emit log_named_uint("investable base after ", baseAfter);
        emit log_named_uint("cedant exposure       ", exposureAfter);
        emit log_named_uint("cedant cap after      ", capAfter);
    }
}
