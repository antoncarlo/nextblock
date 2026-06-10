// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";

/// @title AdapterRegistryTest
/// @notice Phase 8 suite: registration gates, duplicate prevention, full status
///         lifecycle with power separation (curator registers, owner activates,
///         sentinel disables), terminal deprecation and non-custodial guarantee.
contract AdapterRegistryTest is Test {
    ProtocolRoles public protocolRoles;
    AdapterRegistry public registry;

    address public admin = makeAddr("admin");
    address public curator = makeAddr("curator");
    address public sentinel = makeAddr("sentinel");
    address public attacker = makeAddr("attacker");
    address public ensuroAdapter = makeAddr("ensuroAdapterContract");

    bytes32 constant ENSURO_ID = keccak256("ENSURO_V3");
    bytes32 constant ONRE_ID = keccak256("ONRE_V1");
    bytes32 constant META = keccak256("due-diligence-pack-v1");
    uint256 constant CAP_1M = 1_000_000e6;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        registry = new AdapterRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), curator);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        vm.stopPrank();
    }

    function _register() internal {
        vm.prank(curator);
        registry.registerAdapter(ENSURO_ID, ensuroAdapter, "Ensuro", META, CAP_1M);
    }

    // =========== REGISTRATION ===========

    function test_register_byCurator() public {
        vm.prank(curator);
        vm.expectEmit(true, true, false, true);
        emit AdapterRegistry.AdapterRegistered(ENSURO_ID, ensuroAdapter, "Ensuro", META, CAP_1M);
        registry.registerAdapter(ENSURO_ID, ensuroAdapter, "Ensuro", META, CAP_1M);

        AdapterRegistry.Adapter memory a = registry.getAdapter(ENSURO_ID);
        assertEq(a.adapter, ensuroAdapter);
        assertEq(a.exposureCap, CAP_1M);
        assertEq(uint8(a.status), uint8(AdapterRegistry.AdapterStatus.PENDING));
        assertEq(registry.getAdapterCount(), 1);
        assertFalse(registry.isAdapterActive(ENSURO_ID)); // PENDING != ACTIVE
    }

    function test_register_onlyCurator() public {
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(AdapterRegistry.AdapterRegistry__UnauthorizedRole.selector, attacker, curatorRole)
        );
        registry.registerAdapter(ENSURO_ID, ensuroAdapter, "Ensuro", META, CAP_1M);
    }

    function test_register_duplicate_reverts() public {
        _register();
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(AdapterRegistry.AdapterRegistry__DuplicateAdapter.selector, ENSURO_ID));
        registry.registerAdapter(ENSURO_ID, makeAddr("other"), "Ensuro2", META, CAP_1M);
    }

    function test_register_invalidParams_revert() public {
        vm.startPrank(curator);
        vm.expectRevert(AdapterRegistry.AdapterRegistry__InvalidParams.selector);
        registry.registerAdapter(bytes32(0), ensuroAdapter, "Ensuro", META, CAP_1M);
        vm.expectRevert(AdapterRegistry.AdapterRegistry__InvalidParams.selector);
        registry.registerAdapter(ENSURO_ID, address(0), "Ensuro", META, CAP_1M);
        vm.expectRevert(AdapterRegistry.AdapterRegistry__InvalidParams.selector);
        registry.registerAdapter(ENSURO_ID, ensuroAdapter, "", META, CAP_1M);
        vm.expectRevert(AdapterRegistry.AdapterRegistry__InvalidParams.selector);
        registry.registerAdapter(ENSURO_ID, ensuroAdapter, "Ensuro", bytes32(0), CAP_1M);
        vm.stopPrank();
    }

    // =========== LIFECYCLE & POWER SEPARATION ===========

    function test_activate_onlyOwnerRole() public {
        _register();

        // Curator registered it but CANNOT activate (governance power)
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(curator);
        vm.expectRevert(
            abi.encodeWithSelector(AdapterRegistry.AdapterRegistry__UnauthorizedRole.selector, curator, ownerRole)
        );
        registry.activateAdapter(ENSURO_ID);

        // Sentinel cannot activate either (it can only reduce risk)
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(AdapterRegistry.AdapterRegistry__UnauthorizedRole.selector, sentinel, ownerRole)
        );
        registry.activateAdapter(ENSURO_ID);

        vm.prank(admin);
        registry.activateAdapter(ENSURO_ID);
        assertTrue(registry.isAdapterActive(ENSURO_ID));
    }

    function test_disable_bySentinel_andReactivate() public {
        _register();
        vm.prank(admin);
        registry.activateAdapter(ENSURO_ID);

        // Sentinel risk action
        vm.prank(sentinel);
        vm.expectEmit(true, true, false, true);
        emit AdapterRegistry.AdapterDisabled(ENSURO_ID, sentinel);
        registry.disableAdapter(ENSURO_ID);
        assertFalse(registry.isAdapterActive(ENSURO_ID));

        // Governance can re-activate after review
        vm.prank(admin);
        registry.activateAdapter(ENSURO_ID);
        assertTrue(registry.isAdapterActive(ENSURO_ID));
    }

    function test_deprecate_terminal() public {
        _register();
        vm.prank(admin);
        registry.deprecateAdapter(ENSURO_ID);

        // Terminal: no reactivation, no cap/metadata updates, no re-disable
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdapterRegistry.AdapterRegistry__InvalidStatus.selector,
                ENSURO_ID,
                AdapterRegistry.AdapterStatus.DEPRECATED
            )
        );
        registry.activateAdapter(ENSURO_ID);

        vm.prank(curator);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdapterRegistry.AdapterRegistry__InvalidStatus.selector,
                ENSURO_ID,
                AdapterRegistry.AdapterStatus.DEPRECATED
            )
        );
        registry.setExposureCap(ENSURO_ID, 1);

        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                AdapterRegistry.AdapterRegistry__InvalidStatus.selector,
                ENSURO_ID,
                AdapterRegistry.AdapterStatus.DEPRECATED
            )
        );
        registry.disableAdapter(ENSURO_ID);
    }

    function test_capAndMetadata_updates() public {
        _register();

        vm.prank(curator);
        vm.expectEmit(true, false, false, true);
        emit AdapterRegistry.AdapterExposureCapUpdated(ENSURO_ID, 500_000e6);
        registry.setExposureCap(ENSURO_ID, 500_000e6);
        assertEq(registry.getAdapter(ENSURO_ID).exposureCap, 500_000e6);

        bytes32 newMeta = keccak256("due-diligence-pack-v2");
        vm.prank(curator);
        registry.setMetadata(ENSURO_ID, newMeta);
        assertEq(registry.getAdapter(ENSURO_ID).metadataHash, newMeta);

        // Gates
        vm.prank(attacker);
        vm.expectRevert();
        registry.setExposureCap(ENSURO_ID, 1);
    }

    function test_multipleAdapters_enumeration() public {
        _register();
        vm.prank(curator);
        registry.registerAdapter(ONRE_ID, makeAddr("onreAdapter"), "OnRe", META, CAP_1M);

        bytes32[] memory ids = registry.getAdapterIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], ENSURO_ID);
        assertEq(ids[1], ONRE_ID);
    }

    function test_getAdapter_notFound_reverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(AdapterRegistry.AdapterRegistry__AdapterNotFound.selector, keccak256("NEXUS"))
        );
        registry.getAdapter(keccak256("NEXUS"));
        assertFalse(registry.isAdapterActive(keccak256("NEXUS")));
    }

    // =========== NON-CUSTODIAL GUARANTEE ===========

    function test_registry_isNonCustodial() public {
        _register();
        // No payable functions, no token references, no call forwarding:
        // the registry can never hold or move value.
        assertEq(address(registry).balance, 0);
        (bool ok,) = address(registry).call{value: 1 ether}("");
        assertFalse(ok); // no receive/fallback: plain value transfers revert
    }

    function test_constructor_zeroRoles_reverts() public {
        vm.expectRevert(AdapterRegistry.AdapterRegistry__InvalidParams.selector);
        new AdapterRegistry(address(0));
    }
}
