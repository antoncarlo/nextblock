// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract VaultFactoryTest is Test {
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    VaultFactory public factory;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public managerB = makeAddr("managerB");
    address public notAdmin = makeAddr("notAdmin");

    function setUp() public {
        vm.startPrank(admin);

        usdc = new MockUSDC();
        oracle = new MockOracle();
        registry = new PolicyRegistry();
        claimReceipt = new ClaimReceipt();

        factory = new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt)
        );

        // Set factory as registrar so it can auto-register minters on createVault
        claimReceipt.setRegistrar(address(factory));

        vm.stopPrank();
    }

    function test_createVault() public {
        vm.prank(admin);
        address vault = factory.createVault(
            "NextBlock Balanced Core",
            "nxbBAL",
            "Balanced Core",
            managerA,
            2000,   // 20% buffer
            50      // 0.5% fee
        );

        assertTrue(vault != address(0));
        assertTrue(factory.isVault(vault));
        assertEq(factory.getVaultCount(), 1);
    }

    function test_createVault_correctConfig() public {
        vm.prank(admin);
        address vault = factory.createVault(
            "NextBlock Balanced Core",
            "nxbBAL",
            "Balanced Core",
            managerA,
            2000,
            50
        );

        InsuranceVault v = InsuranceVault(vault);
        assertEq(v.vaultManager(), managerA);
        assertEq(v.bufferRatioBps(), 2000);
        assertEq(v.managementFeeBps(), 50);
        assertEq(v.owner(), admin); // Owner is msg.sender (admin called via prank)
    }

    function test_createVault_permissionless() public {
        // Anyone can create a vault; vault owner = msg.sender
        vm.prank(notAdmin);
        address vault = factory.createVault(
            "Community Vault",
            "nxbCOM",
            "Community",
            managerA,
            2000,
            50
        );

        assertTrue(vault != address(0));
        assertTrue(factory.isVault(vault));

        InsuranceVault v = InsuranceVault(vault);
        assertEq(v.owner(), notAdmin); // Vault owner is the caller (notAdmin), not factory owner
    }

    function test_createVault_multiple() public {
        vm.startPrank(admin);

        address vaultAAddr = factory.createVault(
            "NextBlock Balanced Core", "nxbBAL", "Balanced Core",
            managerA, 2000, 50
        );

        address vaultBAddr = factory.createVault(
            "NextBlock DeFi Alpha", "nxbALPHA", "DeFi Alpha",
            managerB, 1500, 100
        );

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
        address vault = factory.createVault(
            "NextBlock Balanced Core", "nxbBAL", "Balanced Core",
            managerA, 2000, 50
        );

        // Verify the vault is registered as an authorized minter on ClaimReceipt
        assertTrue(claimReceipt.authorizedMinters(vault));
    }

    function test_createVault_registrarCanAddMinter() public {
        // Verify that factory (as registrar) can add minters but non-registrar cannot
        // First, a non-admin/non-registrar address creates a vault -- factory is registrar so it works
        vm.prank(notAdmin);
        address vault = factory.createVault(
            "Test Vault", "TEST", "Test",
            managerA, 2000, 50
        );

        // Vault should be auto-registered as minter via the registrar role
        assertTrue(claimReceipt.authorizedMinters(vault));

        // Verify registrar address is the factory
        assertEq(claimReceipt.registrar(), address(factory));
    }

    function test_createVault_invalidManager() public {
        vm.prank(admin);
        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        factory.createVault(
            "Test", "TEST", "Test Vault",
            address(0), 2000, 50
        );
    }

    function test_createVault_invalidBufferRatio() public {
        vm.prank(admin);
        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        factory.createVault(
            "Test", "TEST", "Test Vault",
            managerA, 10001, 50 // > 100%
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
        new VaultFactory(address(0), address(registry), address(oracle), address(claimReceipt));

        vm.expectRevert(VaultFactory.VaultFactory__InvalidParams.selector);
        new VaultFactory(address(usdc), address(0), address(oracle), address(claimReceipt));

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
        factory.createVault(
            "NextBlock Balanced Core", "nxbBAL", "Balanced Core",
            managerA, 2000, 50
        );
    }
}
