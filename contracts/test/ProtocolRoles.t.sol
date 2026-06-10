// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultDeployer} from "../src/VaultDeployer.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";

/// @title ProtocolRolesTest
/// @notice Phase 1 access-control suite: role lifecycle (grant/revoke) for every
///         canonical role, plus unauthorized-call reverts for each gated function
///         across PolicyRegistry, VaultFactory and InsuranceVault.
contract ProtocolRolesTest is Test {
    ProtocolRoles public protocolRoles;
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    VaultFactory public factory;
    InsuranceVault public vault;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;

    address public admin = makeAddr("admin");
    address public curator = makeAddr("curator");
    address public cedant = makeAddr("cedant");
    address public depositor = makeAddr("depositor");
    address public attacker = makeAddr("attacker");
    address public insurer = makeAddr("insurer");

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        registry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        VaultDeployer vaultDeployer = new VaultDeployer();
        factory = new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt),
            address(protocolRoles),
            address(compliance),
            address(portfolioRegistry),
            address(vaultDeployer)
        );
        vaultDeployer.bindFactory(address(factory));
        claimReceipt.setRegistrar(address(factory));

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), curator);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), depositor);
        protocolRoles.grantRole(protocolRoles.VAULT_FACTORY_ROLE(), address(factory));

        vm.stopPrank();

        vm.prank(curator);
        vault = InsuranceVault(
            factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", curator, 2000, 50)
        );
    }

    // =========== ROLE CONSTANTS ===========

    function test_roleConstants_distinct() public view {
        bytes32[10] memory roles = _allRoles();
        for (uint256 i = 0; i < roles.length; i++) {
            for (uint256 j = i + 1; j < roles.length; j++) {
                assertTrue(roles[i] != roles[j], "duplicate role id");
            }
        }
    }

    function test_constructor_grantsOwnerAndDefaultAdmin() public view {
        assertTrue(protocolRoles.hasRole(protocolRoles.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(protocolRoles.hasRole(protocolRoles.OWNER_ROLE(), admin));
    }

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert(ProtocolRoles.ProtocolRoles__ZeroAddress.selector);
        new ProtocolRoles(address(0));
    }

    function test_ownerRole_isAdminOfOperationalRoles() public view {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.UNDERWRITING_CURATOR_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.ALLOCATOR_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.SENTINEL_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.CLAIMS_COMMITTEE_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.PREMIUM_DEPOSITOR_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.AUTHORIZED_CEDANT_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.VAULT_FACTORY_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.KYC_OPERATOR_ROLE()), ownerRole);
        assertEq(protocolRoles.getRoleAdmin(protocolRoles.ORACLE_ROLE()), ownerRole);
    }

    // =========== GRANT / REVOKE LIFECYCLE ===========

    function test_grantAndRevoke_everyRole() public {
        bytes32[10] memory roles = _allRoles();
        address account = makeAddr("roleHolder");

        for (uint256 i = 0; i < roles.length; i++) {
            // OWNER_ROLE is administered by DEFAULT_ADMIN_ROLE; admin holds both.
            vm.prank(admin);
            protocolRoles.grantRole(roles[i], account);
            assertTrue(protocolRoles.hasRole(roles[i], account), "grant failed");

            vm.prank(admin);
            protocolRoles.revokeRole(roles[i], account);
            assertFalse(protocolRoles.hasRole(roles[i], account), "revoke failed");
        }
    }

    function test_grantRole_unauthorized_reverts() public {
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, ownerRole)
        );
        protocolRoles.grantRole(curatorRole, attacker);
    }

    function test_revokedCurator_losesAccess() public {
        // Curator can activate a registered policy; after revoke it cannot.
        vm.prank(cedant);
        uint256 pid = registry.registerPolicy(
            "Treaty", PolicyRegistry.VerificationType.OFF_CHAIN, 10_000e6, 1_000e6, 90 days, insurer, 0
        );

        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(admin);
        protocolRoles.revokeRole(curatorRole, curator);

        vm.prank(curator);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, curator, curatorRole)
        );
        registry.activatePolicy(pid);
    }

    function test_requireRole_revertsForMissingRole() public {
        bytes32 sentinelRole = protocolRoles.SENTINEL_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, sentinelRole)
        );
        protocolRoles.requireRole(sentinelRole, attacker);
    }

    // =========== GATED FUNCTIONS: UNAUTHORIZED REVERTS ===========

    function test_gate_registerPolicy() public {
        bytes32 cedantRole = protocolRoles.AUTHORIZED_CEDANT_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, attacker, cedantRole)
        );
        registry.registerPolicy("X", PolicyRegistry.VerificationType.OFF_CHAIN, 1e6, 1e6, 1 days, insurer, 0);
    }

    function test_gate_activatePolicy() public {
        vm.prank(cedant);
        uint256 pid =
            registry.registerPolicy("X", PolicyRegistry.VerificationType.OFF_CHAIN, 1e6, 1e6, 1 days, insurer, 0);

        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, attacker, curatorRole)
        );
        registry.activatePolicy(pid);
    }

    function test_gate_advanceTime() public {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, attacker, ownerRole)
        );
        registry.advanceTime(1 days);
    }

    function test_gate_createVault() public {
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.VaultFactory__UnauthorizedRole.selector, attacker, curatorRole)
        );
        factory.createVault("X", "X", "X", curator, 2000, 50);
    }

    function test_gate_addPolicy() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.addPolicy(0, 1000);
    }

    function test_gate_addPolicy_managerWithoutRole() public {
        // Per-vault manager identity alone is NOT sufficient: role revocation blocks it.
        vm.prank(cedant);
        uint256 pid = registry.registerPolicy(
            "Treaty", PolicyRegistry.VerificationType.OFF_CHAIN, 10_000e6, 1_000e6, 90 days, insurer, 0
        );
        vm.prank(curator);
        registry.activatePolicy(pid);

        bytes32 curatorRole2 = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(admin);
        protocolRoles.revokeRole(curatorRole2, curator);

        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, curator));
        vault.addPolicy(pid, 1000);
    }

    function test_gate_depositPremium() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.depositPremium(0, 1_000e6);
    }

    function test_gate_vaultOwnerFunctions() public {
        vm.startPrank(attacker);

        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.setAuthorizedPremiumDepositor(attacker, true);

        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.claimFees(attacker);

        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.setClaimManager(attacker);

        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker));
        vault.setVaultAllocator(attacker);

        vm.stopPrank();
    }

    // =========== AUTHORIZED PATHS STILL WORK ===========

    function test_authorized_fullRoleFlow() public {
        // Cedant registers, curator activates, curator adds to vault, depositor funds.
        vm.prank(cedant);
        uint256 pid = registry.registerPolicy(
            "Quota Share Treaty", PolicyRegistry.VerificationType.OFF_CHAIN, 10_000e6, 1_000e6, 90 days, insurer, 0
        );

        vm.prank(curator);
        registry.activatePolicy(pid);

        vm.prank(curator);
        vault.addPolicy(pid, 10_000);

        vm.startPrank(admin);
        usdc.mint(depositor, 1_000e6);
        vm.stopPrank();

        vm.startPrank(depositor);
        usdc.approve(address(vault), 1_000e6);
        vault.depositPremium(pid, 1_000e6);
        vm.stopPrank();

        (,, uint256 premium,,,) = vault.vaultPolicies(pid);
        assertEq(premium, 1_000e6);
    }

    // =========== HELPERS ===========

    function _allRoles() internal view returns (bytes32[10] memory roles) {
        roles[0] = protocolRoles.OWNER_ROLE();
        roles[1] = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        roles[2] = protocolRoles.ALLOCATOR_ROLE();
        roles[3] = protocolRoles.SENTINEL_ROLE();
        roles[4] = protocolRoles.CLAIMS_COMMITTEE_ROLE();
        roles[5] = protocolRoles.PREMIUM_DEPOSITOR_ROLE();
        roles[6] = protocolRoles.AUTHORIZED_CEDANT_ROLE();
        roles[7] = protocolRoles.VAULT_FACTORY_ROLE();
        roles[8] = protocolRoles.KYC_OPERATOR_ROLE();
        roles[9] = protocolRoles.ORACLE_ROLE();
    }
}
