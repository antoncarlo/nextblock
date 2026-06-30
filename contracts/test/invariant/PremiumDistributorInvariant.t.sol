// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {PremiumDistributor} from "../../src/PremiumDistributor.sol";

/// @title PremiumDistributorHandler
/// @notice Bounded-action handler for the premium fee-splitting distributor:
///         cedant premium receipts (across portfolios), OWNER fee claims, and
///         split reconfiguration. Ghost variables are additive-only so the
///         invariants assert additive equalities without handler subtractions.
contract PremiumDistributorHandler is Test {
    PremiumDistributor public distributor;
    InsuranceVault public vault;
    MockUSDC public usdc;

    address public admin;
    address public cedant;
    address public feeSink;
    uint256[] public portfolioIds;

    // --- Ghost variables (monotonic) ---
    uint256 public ghost_grossReceived;
    uint256 public ghost_lpForwarded;
    uint256 public ghost_protocolAccruedTotal;
    uint256 public ghost_underwritingAccruedTotal;
    uint256 public ghost_protocolClaimed;
    uint256 public ghost_underwritingClaimed;

    uint256 internal constant MAX_PROTOCOL_FEE_BPS = 500;
    uint256 internal constant MAX_UNDERWRITING_FEE_BPS = 2_000;

    struct HandlerConfig {
        PremiumDistributor distributor;
        InsuranceVault vault;
        MockUSDC usdc;
        address admin;
        address cedant;
        address feeSink;
        uint256[] portfolioIds;
    }

    constructor(HandlerConfig memory c) {
        distributor = c.distributor;
        vault = c.vault;
        usdc = c.usdc;
        admin = c.admin;
        cedant = c.cedant;
        feeSink = c.feeSink;
        portfolioIds = c.portfolioIds;
    }

    function receivePremium(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        amount = bound(amount, 1, 1_000_000e6);

        // Split is deterministic at the current config; preview matches the
        // booking inside receivePremium exactly (same bps, same rounding).
        (uint256 lpQuota, uint256 protocolFee, uint256 underwritingFee) = distributor.previewSplit(amount);

        vm.prank(admin);
        usdc.mint(cedant, amount);
        vm.startPrank(cedant);
        usdc.approve(address(distributor), amount);
        distributor.receivePremium(pid, amount);
        vm.stopPrank();

        ghost_grossReceived += amount;
        ghost_lpForwarded += lpQuota;
        ghost_protocolAccruedTotal += protocolFee;
        ghost_underwritingAccruedTotal += underwritingFee;
    }

    function claimProtocol() external {
        uint256 accrued = distributor.accruedProtocolFees();
        if (accrued == 0) return;
        vm.prank(admin);
        distributor.claimProtocolFees(feeSink);
        ghost_protocolClaimed += accrued;
    }

    function claimUnderwriting() external {
        uint256 accrued = distributor.accruedUnderwritingFees();
        if (accrued == 0) return;
        vm.prank(admin);
        distributor.claimUnderwritingFees(feeSink);
        ghost_underwritingClaimed += accrued;
    }

    function setSplit(uint256 pSeed, uint256 uSeed) external {
        uint256 p = bound(pSeed, 0, MAX_PROTOCOL_FEE_BPS);
        uint256 u = bound(uSeed, 0, MAX_UNDERWRITING_FEE_BPS);
        vm.prank(admin);
        distributor.setPremiumSplit(p, u);
    }
}

/// @title PremiumDistributorInvariantTest
/// @author Anton Carlo Santoro
/// @notice Phase-5 protocol-wide coverage: dedicated stateful invariants for the
///         PremiumDistributor's fee accounting — held balance equals unclaimed
///         fees (LP quota never parks), gross split conservation, and forwarded
///         LP quota fully reconciles with the vault's USDC.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 48
/// forge-config: default.invariant.fail-on-revert = true
contract PremiumDistributorInvariantTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimReceipt internal claimReceipt;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    PremiumDistributor internal distributor;
    PremiumDistributorHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal managerA = makeAddr("managerA");
    address internal cedant = makeAddr("cedant");
    address internal feeSink = makeAddr("feeSink");

    uint256[] internal portfolioIdsArr;

    function setUp() public {
        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(roles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolioRegistry = new PortfolioRegistry(address(roles));
        distributor = new PremiumDistributor(address(usdc), address(roles), address(portfolioRegistry));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), admin);
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), managerA);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), admin); // submits portfolios in setUp
        // The distributor forwards the LP quota into the vault via recordPortfolioPremium.
        roles.grantRole(roles.PREMIUM_DEPOSITOR_ROLE(), address(distributor));

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Reinsurance Vault",
                symbol: "nbRV",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0, // isolate distributor accounting (no vault fee bleed)
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);

        portfolioIdsArr.push(_activePortfolio("Premium CAT", 500_000e6));
        portfolioIdsArr.push(_activePortfolio("Premium Marine", 300_000e6));
        distributor.setPortfolioVault(portfolioIdsArr[0], address(vault));
        distributor.setPortfolioVault(portfolioIdsArr[1], address(vault));
        vm.stopPrank();

        handler = new PremiumDistributorHandler(
            PremiumDistributorHandler.HandlerConfig({
                distributor: distributor,
                vault: vault,
                usdc: usdc,
                admin: admin,
                cedant: cedant,
                feeSink: feeSink,
                portfolioIds: portfolioIdsArr
            })
        );

        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](4);
        sels[0] = PremiumDistributorHandler.receivePremium.selector;
        sels[1] = PremiumDistributorHandler.claimProtocol.selector;
        sels[2] = PremiumDistributorHandler.claimUnderwriting.selector;
        sels[3] = PremiumDistributorHandler.setSplit.selector;
        targetSelector(StdInvariant.FuzzSelector({addr: address(handler), selectors: sels}));
    }

    function _activePortfolio(string memory name, uint256 coverage) internal returns (uint256 pid) {
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: name,
                metadataURI: "ipfs://pd",
                documentHash: keccak256(bytes(name)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverage,
                cededPremium: 1_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 3650 days)
            })
        );
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500);
        portfolioRegistry.activatePortfolio(pid);
    }

    // -----------------------------------------------------------------
    // INVARIANTS
    // -----------------------------------------------------------------

    /// @notice The distributor holds EXACTLY the unclaimed fees: the LP quota is
    ///         forwarded atomically and never parks here.
    function invariant_balanceEqualsUnclaimedFees() public view {
        assertEq(
            usdc.balanceOf(address(distributor)),
            distributor.accruedProtocolFees() + distributor.accruedUnderwritingFees(),
            "distributor balance != unclaimed fees"
        );
    }

    /// @notice Gross split conservation: every unit of premium ever received is
    ///         exactly LP quota + protocol fee + underwriting fee.
    function invariant_grossSplitConservation() public view {
        assertEq(
            handler.ghost_grossReceived(),
            handler.ghost_lpForwarded() + handler.ghost_protocolAccruedTotal()
                + handler.ghost_underwritingAccruedTotal(),
            "gross != lpQuota + protocolFee + underwritingFee"
        );
    }

    /// @notice The contract's own gross counter matches the ghost.
    function invariant_totalGrossMatchesGhost() public view {
        assertEq(distributor.totalGrossReceived(), handler.ghost_grossReceived(), "totalGrossReceived drift");
    }

    /// @notice Accrued fees == ever-accrued − claimed (additive form, both sides).
    function invariant_feeLedger() public view {
        assertEq(
            distributor.accruedProtocolFees() + handler.ghost_protocolClaimed(),
            handler.ghost_protocolAccruedTotal(),
            "protocol fee ledger drift"
        );
        assertEq(
            distributor.accruedUnderwritingFees() + handler.ghost_underwritingClaimed(),
            handler.ghost_underwritingAccruedTotal(),
            "underwriting fee ledger drift"
        );
    }

    /// @notice The forwarded LP quota fully reconciles with the vault's USDC
    ///         (no LP deposits and zero vault fee in this harness).
    function invariant_lpQuotaReachesVault() public view {
        assertEq(usdc.balanceOf(address(vault)), handler.ghost_lpForwarded(), "vault USDC != forwarded LP quota");
    }
}
