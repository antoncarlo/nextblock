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
import {VaultFactory} from "../src/VaultFactory.sol";

/// @title CrossVaultConcentrationRepro
/// @author Anton Carlo Santoro
/// @notice Per-vault concentration limits do bound protocol-wide concentration.
///         What they do not do is diversify the counterparty.
///
/// @dev Written to check a suspicion that turned out to be wrong, and kept
///      because the answer is worth having in the repository rather than in
///      somebody's memory.
///
///      The suspicion: `cedantExposure(vault, cedant)` walks one vault, and the
///      ceiling is a percentage of that same vault's base, so N vaults each at
///      the limit might carry N times the intended concentration.
///
///      They do not. If every vault satisfies e_i <= L * b_i, then summing
///      gives sum(e_i) <= L * sum(b_i), so the aggregate ratio is at most L for
///      any number of vaults of any size. The exposure grows with the protocol,
///      and so does the capital behind it. The numbers logged below show it:
///      two vaults at the limit produce the same aggregate percentage as one.
///
///      What survives is smaller and is a disclosure matter rather than a
///      solvency one. Nothing stops every vault from concentrating on the same
///      cedant, so an LP spreading capital across several vaults may be buying
///      the same counterparty each time while believing the opposite. The limit
///      is doing its job; it was never a diversification guarantee, and the
///      product surface should not imply that it is.
contract CrossVaultConcentrationReproTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    VaultAllocator internal allocatorC;

    InsuranceVault internal vaultA;
    InsuranceVault internal vaultB;

    address internal governance = makeAddr("governance");
    address internal curator = makeAddr("curator");
    address internal allocatorKey = makeAddr("allocator");
    address internal cedant = makeAddr("single_cedant");
    address internal kycKey = makeAddr("kyc");
    address internal lp = makeAddr("lp");

    uint256 internal pidA;
    uint256 internal pidB;

    uint256 internal constant CAPITAL_PER_VAULT = 1_000_000e6;

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
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);

        vaultA = _vault("Cross Vault A", "nbXA");
        vaultB = _vault("Cross Vault B", "nbXB");
        vm.stopPrank();

        vm.startPrank(kycKey);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        // One cedant, two books. Nothing about this is unusual: a reinsurer
        // ceding two lines of business is the ordinary case.
        pidA = _activeBook("Cedant Book A");
        pidB = _activeBook("Cedant Book B");
    }

    /// @notice Two vaults at the limit, and the aggregate is still at the limit.
    function test_aggregateConcentrationStaysInsideThePerVaultLimit() public {
        _fund(vaultA);
        _fund(vaultB);

        uint256 inA = _allocateUpToCedantLimit(vaultA, pidA);
        uint256 inB = _allocateUpToCedantLimit(vaultB, pidB);

        // Every vault-level check passes.
        uint256 baseA = allocatorC.investableBase(address(vaultA));
        uint256 baseB = allocatorC.investableBase(address(vaultB));
        uint256 limitBps = allocatorC.maxCedantConcentrationBps();

        assertLe(
            allocatorC.cedantExposure(address(vaultA), cedant),
            baseA * limitBps / 10_000,
            "vault A is inside its own cedant limit"
        );
        assertLe(
            allocatorC.cedantExposure(address(vaultB), cedant),
            baseB * limitBps / 10_000,
            "vault B is inside its own cedant limit"
        );

        // The protocol's total exposure to this counterparty is the sum of two
        // full allowances — twice the absolute figure, against twice the
        // capital. The ratio is what a concentration limit constrains, and it
        // is unchanged.
        uint256 protocolExposure = inA + inB;
        uint256 protocolBase = baseA + baseB;
        uint256 aggregateBps = protocolExposure * 10_000 / protocolBase;

        emit log_named_uint("exposure in vault A (USDC)", inA / 1e6);
        emit log_named_uint("exposure in vault B (USDC)", inB / 1e6);
        emit log_named_uint("protocol exposure to one cedant (USDC)", protocolExposure / 1e6);
        emit log_named_uint("per-vault limit (bps)", limitBps);
        emit log_named_uint("aggregate concentration (bps)", aggregateBps);

        assertGt(inA, 0, "the run must actually place exposure in vault A");
        assertGt(inB, 0, "the run must actually place exposure in vault B");

        // The correction, asserted so it cannot quietly stop being true: the
        // aggregate ratio stays inside the per-vault limit no matter how many
        // vaults are added, because the base grows with the exposure.
        assertLe(aggregateBps, limitBps, "aggregate concentration is bounded by the per-vault limit");
    }

    /// @notice Both vaults end up on the same counterparty, and nothing objects.
    /// @dev The residual worth stating. Each vault is compliant; an LP holding
    ///      both is concentrated in a way neither vault reports.
    function test_vaultsDoNotDiversifyTheCounterparty() public {
        _fund(vaultA);
        _fund(vaultB);
        _allocateUpToCedantLimit(vaultA, pidA);
        _allocateUpToCedantLimit(vaultB, pidB);

        assertEq(
            portfolios.getPortfolio(pidA).cedant,
            portfolios.getPortfolio(pidB).cedant,
            "both books were ceded by the same counterparty"
        );
        assertGt(allocatorC.cedantExposure(address(vaultA), cedant), 0, "vault A carries that exposure");
        assertGt(allocatorC.cedantExposure(address(vaultB), cedant), 0, "vault B carries the same exposure");
    }

    /// @notice Without a registry the absolute cedant ceiling binds one vault at
    ///         a time, so two vaults can each take the whole of it.
    /// @dev The failure mode percentages do not have. A percentage limit
    ///      self-normalises across vaults; an absolute one does not, so a
    ///      ceiling meant to cap what the protocol owes a counterparty caps
    ///      only what each vault owes it.
    function test_absoluteCedantCeilingIsPerVaultWithoutARegistry() public {
        uint256 ceiling = 100_000e6;
        vm.prank(governance);
        allocatorC.setAbsoluteExposureCaps(ceiling, ceiling);

        _fund(vaultA);
        _fund(vaultB);

        _allocate(vaultA, pidA, ceiling);
        _allocate(vaultB, pidB, ceiling);

        assertEq(
            allocatorC.cedantExposure(address(vaultA), cedant) + allocatorC.cedantExposure(address(vaultB), cedant),
            ceiling * 2,
            "the protocol owes this counterparty twice the stated ceiling"
        );
    }

    /// @notice With a registry the ceiling means what it says.
    function test_theRegistryMakesTheCeilingProtocolWide() public {
        VaultFactory factory = _factoryHolding();

        uint256 ceiling = 100_000e6;
        vm.startPrank(governance);
        allocatorC.setAbsoluteExposureCaps(ceiling, ceiling);
        allocatorC.setVaultFactory(address(factory));
        vm.stopPrank();

        _fund(vaultA);
        _fund(vaultB);

        // The first vault takes the whole allowance.
        _allocate(vaultA, pidA, ceiling);
        assertEq(allocatorC.protocolCedantExposure(address(vaultA), cedant), ceiling, "the allowance is used up");

        // The second is refused for the smallest amount there is, because the
        // counterparty already has everything the protocol will give it.
        vm.prank(allocatorKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultAllocator.VaultAllocator__CedantExposureCapExceeded.selector, cedant, ceiling + 1, ceiling
            )
        );
        allocatorC.proposeAllocation(address(vaultB), pidB, 1);
    }

    /// @notice Capital in a vault outside the registry is outside the ceiling.
    /// @dev Asked rather than assumed. The allocator has no notion of which
    ///      vaults are legitimate — `proposeAllocation` takes an address — so
    ///      the question is what the aggregate ceiling actually covers.
    ///
    ///      It covers the registry and nothing else, and that is defensible
    ///      rather than a hole: the exposure that escapes belongs to capital
    ///      that was never in a protocol vault, so it is not the protocol's
    ///      LPs who carry it. Worth stating explicitly all the same, because
    ///      "the protocol will not owe one counterparty more than X" is a
    ///      sentence someone will read as covering every vault they can see.
    function test_theCeilingCoversTheRegistryAndNothingElse() public {
        InsuranceVault outside = _vaultOutsideTheRegistry();

        VaultFactory registry = _factoryHolding();
        vm.startPrank(governance);
        allocatorC.setVaultFactory(address(registry));
        vm.stopPrank();

        _fund(vaultA);
        _fundVault(outside);

        _allocate(vaultA, pidA, 100_000e6);
        _allocate(outside, pidA, 100_000e6);

        assertGt(allocatorC.cedantExposure(address(outside), cedant), 0, "the unregistered vault carries exposure");
        assertEq(
            allocatorC.protocolCedantExposure(address(vaultA), cedant),
            allocatorC.cedantExposure(address(vaultA), cedant),
            "the aggregate counts registered vaults only"
        );
    }

    // --- helpers ---

    /// @dev A factory cannot mint the vaults this test already built, so a
    ///      stub standing in for the registry is the honest instrument: what is
    ///      under test is the allocator reading a list of vaults, not the
    ///      factory's own deployment path, which VaultFactory.t.sol covers.
    function _factoryHolding() internal returns (VaultFactory) {
        address[] memory vaults = new address[](2);
        vaults[0] = address(vaultA);
        vaults[1] = address(vaultB);
        VaultRegistryStub stub = new VaultRegistryStub(vaults);
        return VaultFactory(address(stub));
    }

    /// @dev A working vault with identical wiring, simply never registered.
    ///      A malformed address would revert on any call and prove nothing.
    function _vaultOutsideTheRegistry() internal returns (InsuranceVault v) {
        vm.startPrank(governance);
        v = _vault("Outside", "nbOUT");
        vm.stopPrank();
    }

    function _fundVault(InsuranceVault v) internal {
        usdc.mint(lp, CAPITAL_PER_VAULT);
        vm.startPrank(lp);
        usdc.approve(address(v), CAPITAL_PER_VAULT);
        v.deposit(CAPITAL_PER_VAULT, lp);
        vm.stopPrank();
    }

    function _allocate(InsuranceVault v, uint256 pid, uint256 amount) internal {
        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(v), pid, amount);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);
    }

    function _vault(string memory name, string memory symbol) internal returns (InsuranceVault v) {
        v = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: name,
                symbol: symbol,
                vaultName: name,
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
        v.setVaultAllocator(address(allocatorC));
    }

    function _activeBook(string memory name) internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: name,
                metadataURI: "ipfs://QmCross",
                documentHash: keccak256(bytes(name)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: 10_000_000e6,
                cededPremium: 500_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 3650 days)
            })
        );
        vm.prank(curator);
        portfolios.startReview(pid);
        vm.prank(curator);
        portfolios.approvePortfolio(pid, 6_500);
        vm.prank(curator);
        portfolios.activatePortfolio(pid);
    }

    function _fund(InsuranceVault v) internal {
        usdc.mint(lp, CAPITAL_PER_VAULT);
        vm.startPrank(lp);
        usdc.approve(address(v), CAPITAL_PER_VAULT);
        v.deposit(CAPITAL_PER_VAULT, lp);
        vm.stopPrank();
    }

    /// @dev Deploys the largest amount all three ceilings permit, so the
    ///      allocation is unimpeachable at the moment it is made.
    function _allocateUpToCedantLimit(InsuranceVault v, uint256 pid) internal returns (uint256 amount) {
        uint256 base = allocatorC.investableBase(address(v));
        uint256 cedantCap = base * allocatorC.maxCedantConcentrationBps() / 10_000;
        uint256 portfolioCap = base * allocatorC.maxPortfolioConcentrationBps() / 10_000;
        uint256 capacity = v.underwritingCapacity();

        amount = portfolioCap < cedantCap ? portfolioCap : cedantCap;
        if (capacity < amount) amount = capacity;

        vm.prank(allocatorKey);
        uint256 propId = allocatorC.proposeAllocation(address(v), pid, amount);
        vm.prank(allocatorKey);
        allocatorC.executeAllocation(propId);
    }
}

/// @notice Minimal stand-in exposing only the vault list the allocator reads.
/// @dev Deliberately not a full VaultFactory. The allocator depends on one
///      function; a stub makes that dependency visible instead of burying it
///      inside a deployment the test does not care about.
contract VaultRegistryStub {
    address[] private vaults;

    constructor(address[] memory vaults_) {
        for (uint256 i; i < vaults_.length; ++i) {
            vaults.push(vaults_[i]);
        }
    }

    function getVaults() external view returns (address[] memory) {
        return vaults;
    }
}
