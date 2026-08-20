// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
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
import {VaultAllocator} from "../../src/VaultAllocator.sol";
import {NavOracle} from "../../src/NavOracle.sol";
import {AIAssessor} from "../../src/AIAssessor.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";

/// @title NegativeAuthorityTest
/// @author Anton Carlo Santoro
/// @notice The negative perimeter: for every role-gated function, every key
///         that must not be able to call it is proved unable to.
///
/// @dev A permission suite normally shows that the right key succeeds. That is
///      the easy half and the one an attacker does not care about. What matters
///      in an audit is the other half — that the sentinel cannot approve a
///      claim, that the oracle cannot move funds, that the committee cannot
///      allocate — and it is the half this repository had no coverage for.
///
///      The matrix is generated from two lists rather than written cell by
///      cell: a function is added once and immediately tested against every
///      unauthorised key. Hand-written cases rot the moment a function is
///      added, because nobody remembers to write the eight new denials.
///
///      Each cell asserts BOTH that the call reverted and that it reverted with
///      the authorisation error rather than some other one. A call that fails
///      because an argument was malformed proves nothing about permissions, and
///      would leave a hole looking exactly like coverage.
contract NegativeAuthorityTest is Test {
    // --- Deployment ---
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    PremiumDistributor internal distributor;
    VaultAllocator internal allocatorC;
    NavOracle internal navOracle;
    AIAssessor internal assessor;
    ClaimManager internal claims;

    // --- One key per role, plus a stranger ---
    address internal governance = makeAddr("A1_governance");
    address internal curator = makeAddr("A2_curator");
    address internal allocatorKey = makeAddr("A3_allocator");
    address internal sentinelKey = makeAddr("A4_sentinel");
    address internal committeeKey = makeAddr("A5_committee");
    address internal cedantKey = makeAddr("A6_cedant");
    address internal depositorKey = makeAddr("A7_depositor");
    address internal kycKey = makeAddr("A8_kyc");
    address internal oracleKey = makeAddr("A9_oracle");
    address internal stranger = makeAddr("stranger_noRoles");

    /// @notice Which role each key holds, aligned with `callers`.
    bytes32[] internal callerRoles;
    address[] internal callers;

    /// @notice One role-gated entry point under test.
    struct Guarded {
        string label;
        address target;
        bytes callData;
        bytes4 expectedError;
        bytes32 requiredRole;
    }

    Guarded[] internal guarded;

    uint256 internal constant DUMMY_ID = 1;

    function setUp() public {
        vm.startPrank(governance);
        roles = new ProtocolRoles(governance);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));
        distributor = new PremiumDistributor(address(usdc), address(roles), address(portfolios));
        navOracle = new NavOracle(address(roles), address(portfolios));
        allocatorC = new VaultAllocator(address(roles), address(portfolios), address(navOracle));
        assessor = new AIAssessor(address(roles));
        claims = new ClaimManager(address(roles), address(portfolios), address(assessor), address(receipts));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.ALLOCATOR_ROLE(), allocatorKey);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinelKey);
        roles.grantRole(roles.CLAIMS_COMMITTEE_ROLE(), committeeKey);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantKey);
        roles.grantRole(roles.PREMIUM_DEPOSITOR_ROLE(), depositorKey);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);
        roles.grantRole(roles.ORACLE_ROLE(), oracleKey);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "Negative Authority Vault",
                symbol: "nbNEG",
                vaultName: "Negative Authority",
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

        _registerCallers();
        _registerGuardedFunctions();
    }

    function _registerCallers() internal {
        callers = [
            governance,
            curator,
            allocatorKey,
            sentinelKey,
            committeeKey,
            cedantKey,
            depositorKey,
            kycKey,
            oracleKey,
            stranger
        ];
        callerRoles = [
            roles.OWNER_ROLE(),
            roles.UNDERWRITING_CURATOR_ROLE(),
            roles.ALLOCATOR_ROLE(),
            roles.SENTINEL_ROLE(),
            roles.CLAIMS_COMMITTEE_ROLE(),
            roles.AUTHORIZED_CEDANT_ROLE(),
            roles.PREMIUM_DEPOSITOR_ROLE(),
            roles.KYC_OPERATOR_ROLE(),
            roles.ORACLE_ROLE(),
            bytes32(0) // the stranger holds nothing
        ];
    }

    /// @dev Adding a function here tests it against every unauthorised key at
    ///      once, which is the only way this stays complete as the protocol
    ///      grows.
    function _add(string memory label, address target, bytes memory callData, bytes4 err, bytes32 role) internal {
        guarded.push(Guarded(label, target, callData, err, role));
    }

    /// @dev Split per contract on purpose: one function holding every selector
    ///      and every role exhausts the stack slots the legacy code generator
    ///      has available. Splitting also means a new contract adds a function
    ///      here rather than lengthening one that already compiles by a hair.
    function _registerGuardedFunctions() internal {
        _registerVault();
        _registerRegistries();
        _registerClaims();
        _registerCompliance();
        _registerAllocatorAndOracle();
        _registerDistributorAndAssessor();
    }

    function _registerVault() internal {
        bytes4 e = InsuranceVault.InsuranceVault__UnauthorizedCaller.selector;
        bytes32 owner = roles.OWNER_ROLE();

        _add("vault.claimFees", address(vault), abi.encodeCall(vault.claimFees, (address(1))), e, owner);
        _add("vault.setDepositCap", address(vault), abi.encodeCall(vault.setDepositCap, (1e6)), e, owner);
        _add("vault.setClaimManager", address(vault), abi.encodeCall(vault.setClaimManager, (address(1))), e, owner);
        _add("vault.setVaultAllocator", address(vault), abi.encodeCall(vault.setVaultAllocator, (address(1))), e, owner);
        _add(
            "vault.addPolicy",
            address(vault),
            abi.encodeCall(vault.addPolicy, (DUMMY_ID, 1_000)),
            e,
            roles.UNDERWRITING_CURATOR_ROLE()
        );
        _add(
            "vault.depositPremium",
            address(vault),
            abi.encodeCall(vault.depositPremium, (DUMMY_ID, 1e6)),
            e,
            roles.PREMIUM_DEPOSITOR_ROLE()
        );
    }

    function _registerRegistries() internal {
        bytes32 cur = roles.UNDERWRITING_CURATOR_ROLE();
        bytes4 pe = PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector;
        bytes4 fe = PortfolioRegistry.PortfolioRegistry__UnauthorizedRole.selector;

        _add("policies.activatePolicy", address(policies), abi.encodeCall(policies.activatePolicy, (DUMMY_ID)), pe, cur);
        _add("portfolios.startReview", address(portfolios), abi.encodeCall(portfolios.startReview, (DUMMY_ID)), fe, cur);
        _add(
            "portfolios.approvePortfolio",
            address(portfolios),
            abi.encodeCall(portfolios.approvePortfolio, (DUMMY_ID, 500)),
            fe,
            cur
        );
        _add(
            "portfolios.rejectPortfolio",
            address(portfolios),
            abi.encodeCall(portfolios.rejectPortfolio, (DUMMY_ID, "no")),
            fe,
            cur
        );
        _add(
            "portfolios.activatePortfolio",
            address(portfolios),
            abi.encodeCall(portfolios.activatePortfolio, (DUMMY_ID)),
            fe,
            cur
        );
        _add(
            "portfolios.pausePortfolio",
            address(portfolios),
            abi.encodeCall(portfolios.pausePortfolio, (DUMMY_ID)),
            fe,
            roles.SENTINEL_ROLE()
        );
    }

    /// @dev The separation that matters most: the committee decides, the
    ///      sentinel challenges, and neither can do the other's job.
    function _registerClaims() internal {
        bytes4 e = ClaimManager.ClaimManager__UnauthorizedRole.selector;
        bytes32 comm = roles.CLAIMS_COMMITTEE_ROLE();
        bytes32 sent = roles.SENTINEL_ROLE();

        _add("claims.approveClaim", address(claims), abi.encodeCall(claims.approveClaim, (DUMMY_ID, 1e6)), e, comm);
        _add("claims.rejectClaim", address(claims), abi.encodeCall(claims.rejectClaim, (DUMMY_ID, "no")), e, comm);
        _add("claims.resolveDispute", address(claims), abi.encodeCall(claims.resolveDispute, (DUMMY_ID, true)), e, comm);
        _add("claims.disputeClaim", address(claims), abi.encodeCall(claims.disputeClaim, (DUMMY_ID, "why")), e, sent);
        _add("claims.freezeClaim", address(claims), abi.encodeCall(claims.freezeClaim, (DUMMY_ID)), e, sent);
        _add("claims.unfreezeClaim", address(claims), abi.encodeCall(claims.unfreezeClaim, (DUMMY_ID)), e, sent);
    }

    /// @dev Who may admit an investor and who may block one are different
    ///      powers held by different keys, and that is the point of the split.
    function _registerCompliance() internal {
        bytes4 e = ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector;
        bytes32 kyc = roles.KYC_OPERATOR_ROLE();

        _add(
            "compliance.setWhitelist",
            address(compliance),
            abi.encodeCall(compliance.setWhitelist, (address(1), true)),
            e,
            kyc
        );
        _add(
            "compliance.setKycExpiry",
            address(compliance),
            abi.encodeCall(compliance.setKycExpiry, (address(1), 1)),
            e,
            kyc
        );
        _add(
            "compliance.setJurisdiction",
            address(compliance),
            abi.encodeCall(compliance.setJurisdiction, (address(1), 1)),
            e,
            kyc
        );
        _add(
            "compliance.setInvestorLimit",
            address(compliance),
            abi.encodeCall(compliance.setInvestorLimit, (address(1), 1)),
            e,
            kyc
        );
        _add(
            "compliance.setBlocked",
            address(compliance),
            abi.encodeCall(compliance.setBlocked, (address(1), true)),
            e,
            roles.SENTINEL_ROLE()
        );
    }

    function _registerAllocatorAndOracle() internal {
        bytes4 ae = VaultAllocator.VaultAllocator__UnauthorizedRole.selector;
        bytes4 ne = NavOracle.NavOracle__UnauthorizedRole.selector;
        bytes32 owner = roles.OWNER_ROLE();
        bytes32 sent = roles.SENTINEL_ROLE();

        _add(
            "allocator.proposeAllocation",
            address(allocatorC),
            abi.encodeCall(allocatorC.proposeAllocation, (address(vault), DUMMY_ID, 1e6)),
            ae,
            roles.ALLOCATOR_ROLE()
        );
        _add(
            "allocator.proposeDeallocation",
            address(allocatorC),
            abi.encodeCall(allocatorC.proposeDeallocation, (address(vault), DUMMY_ID, 1e6)),
            ae,
            roles.ALLOCATOR_ROLE()
        );
        _add(
            "allocator.setConcentrationLimits",
            address(allocatorC),
            abi.encodeCall(allocatorC.setConcentrationLimits, (1_000, 2_000)),
            ae,
            owner
        );
        _add(
            "allocator.setNavOracle",
            address(allocatorC),
            abi.encodeCall(allocatorC.setNavOracle, (address(1))),
            ae,
            owner
        );

        _add(
            "nav.publishNav",
            address(navOracle),
            abi.encodeCall(navOracle.publishNav, (address(vault), 1e6, 9_000, keccak256("s"))),
            ne,
            roles.ORACLE_ROLE()
        );
        _add("nav.pauseFeed", address(navOracle), abi.encodeCall(navOracle.pauseFeed, (address(vault))), ne, sent);
        _add("nav.unpauseFeed", address(navOracle), abi.encodeCall(navOracle.unpauseFeed, (address(vault))), ne, sent);
    }

    function _registerDistributorAndAssessor() internal {
        bytes4 de = PremiumDistributor.PremiumDistributor__UnauthorizedRole.selector;
        bytes32 owner = roles.OWNER_ROLE();

        _add(
            "distributor.setPremiumSplit",
            address(distributor),
            abi.encodeCall(distributor.setPremiumSplit, (100, 500)),
            de,
            owner
        );
        _add(
            "distributor.setPortfolioVault",
            address(distributor),
            abi.encodeCall(distributor.setPortfolioVault, (DUMMY_ID, address(vault))),
            de,
            roles.UNDERWRITING_CURATOR_ROLE()
        );
        _add(
            "distributor.claimProtocolFees",
            address(distributor),
            abi.encodeCall(distributor.claimProtocolFees, (address(1))),
            de,
            owner
        );
        _add(
            "distributor.claimUnderwritingFees",
            address(distributor),
            abi.encodeCall(distributor.claimUnderwritingFees, (address(1))),
            de,
            owner
        );

        _add(
            "assessor.setAnomalyThreshold",
            address(assessor),
            abi.encodeCall(assessor.setAnomalyThreshold, (1_000)),
            AIAssessor.AIAssessor__UnauthorizedRole.selector,
            owner
        );
    }

    // ============================================================
    // The matrix
    // ============================================================

    /// @notice Every unauthorised key is refused by every guarded function.
    function test_negativeAuthorityMatrix() public {
        uint256 cells;
        uint256 skipped;

        for (uint256 f; f < guarded.length; ++f) {
            Guarded memory g = guarded[f];

            for (uint256 c; c < callers.length; ++c) {
                address caller = callers[c];

                // The holder of the required role is tested by the positive
                // suites; here only the denials are of interest.
                if (roles.hasRole(g.requiredRole, caller)) {
                    skipped += 1;
                    continue;
                }

                vm.prank(caller);
                (bool ok, bytes memory ret) = g.target.call(g.callData);

                string memory cell = string.concat(g.label, " from caller#", vm.toString(c));
                assertFalse(ok, string.concat("PERMITTED but must not be: ", cell));
                assertGe(ret.length, 4, string.concat("reverted without a reason: ", cell));
                assertEq(
                    bytes4(ret),
                    g.expectedError,
                    string.concat("reverted for the wrong reason (not an authorisation failure): ", cell)
                );

                cells += 1;
            }
        }

        console2.log("negative authority cells asserted:", cells);
        console2.log("authorised combinations skipped:  ", skipped);

        // The specification asks for at least 180 denials. Asserting the floor
        // keeps the matrix from quietly shrinking when a function is removed.
        assertGe(cells, 180, "matrix below the specified 180-cell floor");
    }
}
