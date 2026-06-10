// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultDeployer} from "../src/VaultDeployer.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";

contract VaultFactoryTest is Test {
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    VaultFactory public factory;
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public managerB = makeAddr("managerB");
    address public notAdmin = makeAddr("notAdmin");

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

        // Set factory as registrar so it can auto-register minters on createVault
        claimReceipt.setRegistrar(address(factory));

        // Underwriting Curators: admin (creates vaults in tests) + managers
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerB);

        // Mark the factory as the canonical vault deployer
        protocolRoles.grantRole(protocolRoles.VAULT_FACTORY_ROLE(), address(factory));

        vm.stopPrank();
    }

    function test_createVault() public {
        vm.prank(admin);
        address vault = factory.createVault(
            "NextBlock Balanced Core",
            "nxbBAL",
            "Balanced Core",
            managerA,
            2000, // 20% buffer
            50 // 0.5% fee
        );

        assertTrue(vault != address(0));
        assertTrue(factory.isVault(vault));
        assertEq(factory.getVaultCount(), 1);
    }

    function test_createVault_correctConfig() public {
        vm.prank(admin);
        address vault = factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", managerA, 2000, 50);

        InsuranceVault v = InsuranceVault(vault);
        assertEq(v.vaultManager(), managerA);
        assertEq(v.bufferRatioBps(), 2000);
        assertEq(v.managementFeeBps(), 50);
        assertEq(v.owner(), admin); // Owner is msg.sender (admin called via prank)
    }

    function test_createVault_requiresCuratorRole() public {
        // Vault creation is permissioned: caller without UNDERWRITING_CURATOR_ROLE reverts
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(notAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.VaultFactory__UnauthorizedRole.selector, notAdmin, curatorRole)
        );
        factory.createVault("Community Vault", "nxbCOM", "Community", managerA, 2000, 50);
    }

    function test_createVault_curatorNonOwnerCanCreate() public {
        // A curator that is not the factory owner can create; vault owner = caller
        vm.prank(managerA);
        address vault = factory.createVault("Curator Vault", "nxbCUR", "Curator Vault", managerA, 2000, 50);

        assertTrue(vault != address(0));
        assertTrue(factory.isVault(vault));

        InsuranceVault v = InsuranceVault(vault);
        assertEq(v.owner(), managerA); // Vault owner is the caller, not factory owner
    }

    function test_createVault_managerNotCurator_reverts() public {
        // The designated vault manager must hold UNDERWRITING_CURATOR_ROLE
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.VaultFactory__ManagerNotCurator.selector, notAdmin));
        factory.createVault("Test", "TEST", "Test Vault", notAdmin, 2000, 50);
    }

    function test_createVault_multiple() public {
        vm.startPrank(admin);

        address vaultAAddr =
            factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", managerA, 2000, 50);

        address vaultBAddr = factory.createVault("NextBlock DeFi Alpha", "nxbALPHA", "DeFi Alpha", managerB, 1500, 100);

        vm.stopPrank();

        assertEq(factory.getVaultCount(), 2);
        assertTrue(factory.isVault(vaultAAddr));
        assertTrue(factory.isVault(vaultBAddr));

        address[] memory vaults = factory.getVaults();
        assertEq(vaults.length, 2);
        assertEq(vaults[0], vaultAAddr);
        assertEq(vaults[1], vaultBAddr);
    }

    function test_createVault_autoRegistersMinter() public {
        // Factory auto-calls claimReceipt.setAuthorizedMinter(vault, true) inside createVault
        vm.prank(admin);
        address vault = factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", managerA, 2000, 50);

        // Verify the vault is registered as an authorized minter on ClaimReceipt
        assertTrue(claimReceipt.authorizedMinters(vault));
    }

    function test_createVault_registrarCanAddMinter() public {
        // Verify that factory (as registrar) can add minters but non-registrar cannot
        // A curator (non-factory-owner) creates a vault -- factory is registrar so it works
        vm.prank(managerA);
        address vault = factory.createVault("Test Vault", "TEST", "Test", managerA, 2000, 50);

        // Vault should be auto-registered as minter via the registrar role
        assertTrue(claimReceipt.authorizedMinters(vault));

        // Verify registrar address is the factory
        assertEq(claimReceipt.registrar(), address(factory));
    }

    function test_createVault_invalidManager() public {
        vm.prank(admin);
        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        factory.createVault("Test", "TEST", "Test Vault", address(0), 2000, 50);
    }

    function test_createVault_invalidBufferRatio() public {
        vm.prank(admin);
        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        factory.createVault(
            "Test",
            "TEST",
            "Test Vault",
            managerA,
            10001,
            50 // > 100%
        );
    }

    function test_getVaults_empty() public view {
        address[] memory vaults = factory.getVaults();
        assertEq(vaults.length, 0);
    }

    function test_getVaultCount() public {
        assertEq(factory.getVaultCount(), 0);

        vm.prank(admin);
        factory.createVault("V1", "V1", "V1", managerA, 2000, 50);
        assertEq(factory.getVaultCount(), 1);
    }

    function test_immutables() public view {
        assertEq(factory.asset(), address(usdc));
        assertEq(factory.policyRegistry(), address(registry));
        assertEq(factory.oracle(), address(oracle));
        assertEq(factory.claimReceiptAddr(), address(claimReceipt));
    }

    function test_constructor_invalidParams() public {
        vm.startPrank(admin);

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(
            address(0),
            address(registry),
            address(oracle),
            address(claimReceipt),
            address(protocolRoles),
            address(compliance),
            address(portfolioRegistry),
            address(1)
        );

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(
            address(usdc),
            address(0),
            address(oracle),
            address(claimReceipt),
            address(protocolRoles),
            address(compliance),
            address(portfolioRegistry),
            address(1)
        );

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt),
            address(0),
            address(compliance),
            address(portfolioRegistry),
            address(1)
        );

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt),
            address(protocolRoles),
            address(0),
            address(portfolioRegistry),
            address(1)
        );

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt),
            address(protocolRoles),
            address(compliance),
            address(0),
            address(1)
        );

        vm.stopPrank();
    }

    function test_event_vaultCreated() public {
        vm.prank(admin);
        vm.expectEmit(false, true, false, true);
        emit VaultFactory.VaultCreated(
            address(0), // We don't know the address yet
            "NextBlock Balanced Core",
            "nxbBAL",
            "Balanced Core",
            managerA,
            2000,
            50
        );
        factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", managerA, 2000, 50);
    }
    // =========== VAULT DEPLOYER (EIP-170 split) ===========

    function test_vaultDeployer_onlyBoundFactory() public {
        VaultDeployer dep = factory.vaultDeployer();

        // Direct deploy bypassing the factory's curator gate: rejected.
        vm.prank(notAdmin);
        vm.expectRevert(abi.encodeWithSelector(VaultDeployer.VaultDeployer__NotFactory.selector, notAdmin));
        dep.deploy(_dummyParams());

        // Re-binding to a different "factory": rejected (one-shot).
        vm.prank(admin);
        vm.expectRevert(VaultDeployer.VaultDeployer__AlreadyBound.selector);
        dep.bindFactory(notAdmin);
    }

    function test_vaultDeployer_bindGates() public {
        VaultDeployer fresh = new VaultDeployer(); // admin = this test contract

        vm.prank(notAdmin);
        vm.expectRevert(abi.encodeWithSelector(VaultDeployer.VaultDeployer__NotAdmin.selector, notAdmin));
        fresh.bindFactory(notAdmin);

        vm.expectRevert(VaultDeployer.VaultDeployer__InvalidParams.selector);
        fresh.bindFactory(address(0));

        // Unbound deployer: nobody can deploy.
        vm.expectRevert(abi.encodeWithSelector(VaultDeployer.VaultDeployer__NotFactory.selector, address(this)));
        fresh.deploy(_dummyParams());
    }

    function _dummyParams() internal view returns (InsuranceVault.VaultInitParams memory) {
        return InsuranceVault.VaultInitParams({
            asset: IERC20(address(usdc)),
            name: "X",
            symbol: "X",
            vaultName: "X",
            owner: admin,
            vaultManager: managerA,
            bufferRatioBps: 2000,
            managementFeeBps: 0,
            registry: address(registry),
            oracle: address(oracle),
            claimReceipt: address(claimReceipt),
            protocolRoles: address(protocolRoles),
            complianceRegistry: address(compliance),
            portfolioRegistry: address(portfolioRegistry)
        });
    }
}
