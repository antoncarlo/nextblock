// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";

/// @title PortfolioRegistryTest
/// @notice Phase 2 suite: institutional portfolio lifecycle, role gates,
///         invalid transitions, expiry via vm.warp, metadata rules and fuzz bounds.
contract PortfolioRegistryTest is Test {
    ProtocolRoles public protocolRoles;
    PortfolioRegistry public registry;

    address public admin = makeAddr("admin");
    address public cedant = makeAddr("cedant");
    address public otherCedant = makeAddr("otherCedant");
    address public curator = makeAddr("curator");
    address public sentinel = makeAddr("sentinel");
    address public attacker = makeAddr("attacker");

    uint64 public inception;
    uint64 public expiry;

    uint256 constant COVERAGE_10M = 10_000_000e6;
    uint256 constant PREMIUM_1M = 1_000_000e6;
    uint16 constant EXPECTED_LOSS_6500 = 6_500; // 65% expected loss ratio
    bytes32 constant DOC_HASH = keccak256("cession-agreement-v1");

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        registry = new PortfolioRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), otherCedant);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), curator);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        vm.stopPrank();

        inception = uint64(block.timestamp);
        expiry = uint64(block.timestamp + 365 days);
    }

    // --- Helpers ---

    function _params() internal view returns (PortfolioRegistry.SubmissionParams memory) {
        return PortfolioRegistry.SubmissionParams({
            name: "EU Property CAT QS 2026",
            metadataURI: "ipfs://QmPortfolioDocs",
            documentHash: DOC_HASH,
            lineOfBusiness: "Property CAT",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: COVERAGE_10M,
            cededPremium: PREMIUM_1M,
            inceptionTime: inception,
            expiryTime: expiry
        });
    }

    function _submit() internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = registry.submitPortfolio(_params());
    }

    function _submitToApproved() internal returns (uint256 pid) {
        pid = _submit();
        vm.prank(curator);
        registry.startReview(pid);
        vm.prank(curator);
        registry.approvePortfolio(pid, EXPECTED_LOSS_6500);
    }

    function _submitToActive() internal returns (uint256 pid) {
        pid = _submitToApproved();
        vm.prank(curator);
        registry.activatePortfolio(pid);
    }

    // =========== SUBMISSION ===========

    function test_submitPortfolio() public {
        uint256 pid = _submit();
        assertEq(pid, 0);
        assertEq(registry.getPortfolioCount(), 1);

        PortfolioRegistry.Portfolio memory pf = registry.getPortfolio(pid);
        assertEq(pf.cedant, cedant);
        assertEq(pf.coverageLimit, COVERAGE_10M);
        assertEq(pf.cededPremium, PREMIUM_1M);
        assertEq(pf.documentHash, DOC_HASH);
        assertEq(uint8(pf.structureType), uint8(PortfolioRegistry.StructureType.QUOTA_SHARE));
        assertEq(uint8(pf.status), uint8(PortfolioRegistry.PortfolioStatus.SUBMITTED));
        assertEq(pf.expectedLossBps, 0); // not assessed yet
        assertEq(pf.inceptionTime, inception);
        assertEq(pf.expiryTime, expiry);
    }

    function test_submitPortfolio_emitsEvent() public {
        vm.prank(cedant);
        vm.expectEmit(true, true, false, true);
        emit PortfolioRegistry.PortfolioSubmitted(
            0, cedant, PortfolioRegistry.StructureType.QUOTA_SHARE, COVERAGE_10M, PREMIUM_1M, inception, expiry
        );
        registry.submitPortfolio(_params());
    }

    function test_submitPortfolio_indexedByCedant() public {
        uint256 p0 = _submit();
        uint256 p1 = _submit();

        uint256[] memory ids = registry.getPortfoliosByCedant(cedant);
        assertEq(ids.length, 2);
        assertEq(ids[0], p0);
        assertEq(ids[1], p1);
        assertEq(registry.getPortfoliosByCedant(otherCedant).length, 0);
    }

    function test_submitPortfolio_unauthorized_reverts() public {
        bytes32 cedantRole = protocolRoles.AUTHORIZED_CEDANT_ROLE();
        PortfolioRegistry.SubmissionParams memory p = _params();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__UnauthorizedRole.selector, attacker, cedantRole
        ));
        registry.submitPortfolio(p);
    }

    function test_submitPortfolio_invalidParams_reverts() public {
        PortfolioRegistry.SubmissionParams memory p;

        // zero coverage
        p = _params();
        p.coverageLimit = 0;
        vm.prank(cedant);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.submitPortfolio(p);

        // zero premium
        p = _params();
        p.cededPremium = 0;
        vm.prank(cedant);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.submitPortfolio(p);

        // expiry <= inception
        p = _params();
        p.expiryTime = p.inceptionTime;
        vm.prank(cedant);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.submitPortfolio(p);

        // missing document hash
        p = _params();
        p.documentHash = bytes32(0);
        vm.prank(cedant);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.submitPortfolio(p);

        // empty name
        p = _params();
        p.name = "";
        vm.prank(cedant);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.submitPortfolio(p);
    }

    function test_constructor_zeroRoles_reverts() public {
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        new PortfolioRegistry(address(0));
    }

    // =========== REVIEW / APPROVAL / REJECTION ===========

    function test_fullLifecycle_toActive() public {
        uint256 pid = _submit();

        vm.prank(curator);
        registry.startReview(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.UNDER_REVIEW));

        vm.prank(curator);
        registry.approvePortfolio(pid, EXPECTED_LOSS_6500);
        PortfolioRegistry.Portfolio memory pf = registry.getPortfolio(pid);
        assertEq(uint8(pf.status), uint8(PortfolioRegistry.PortfolioStatus.APPROVED));
        assertEq(pf.expectedLossBps, EXPECTED_LOSS_6500);
        assertTrue(registry.isAllocatable(pid));

        vm.prank(curator);
        registry.activatePortfolio(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.ACTIVE));
        assertTrue(registry.isAllocatable(pid));
    }

    function test_startReview_onlyCurator() public {
        uint256 pid = _submit();
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__UnauthorizedRole.selector, attacker, curatorRole
        ));
        registry.startReview(pid);
    }

    function test_startReview_wrongStatus_reverts() public {
        uint256 pid = _submitToApproved();
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.APPROVED
        ));
        registry.startReview(pid);
    }

    function test_approvePortfolio_onlyCurator() public {
        uint256 pid = _submit();
        vm.prank(curator);
        registry.startReview(pid);

        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__UnauthorizedRole.selector, attacker, curatorRole
        ));
        registry.approvePortfolio(pid, EXPECTED_LOSS_6500);
    }

    function test_approvePortfolio_skipReview_reverts() public {
        uint256 pid = _submit();
        // SUBMITTED -> APPROVED directly is not allowed
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.SUBMITTED
        ));
        registry.approvePortfolio(pid, EXPECTED_LOSS_6500);
    }

    function test_approvePortfolio_lossBpsOutOfBounds_reverts() public {
        uint256 pid = _submit();
        vm.prank(curator);
        registry.startReview(pid);

        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidLossBps.selector, uint16(10_001)
        ));
        registry.approvePortfolio(pid, 10_001);
    }

    function test_rejectPortfolio_fromSubmittedAndReview() public {
        // Reject from SUBMITTED
        uint256 p0 = _submit();
        vm.prank(curator);
        registry.rejectPortfolio(p0, "incomplete bordereau");
        assertEq(uint8(registry.getPortfolio(p0).status), uint8(PortfolioRegistry.PortfolioStatus.REJECTED));
        assertFalse(registry.isAllocatable(p0));

        // Reject from UNDER_REVIEW
        uint256 p1 = _submit();
        vm.prank(curator);
        registry.startReview(p1);
        vm.prank(curator);
        vm.expectEmit(true, true, false, true);
        emit PortfolioRegistry.PortfolioRejected(p1, curator, "loss history above appetite");
        registry.rejectPortfolio(p1, "loss history above appetite");
    }

    function test_rejectPortfolio_terminal_noFurtherTransitions() public {
        uint256 pid = _submit();
        vm.prank(curator);
        registry.rejectPortfolio(pid, "rejected");

        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.REJECTED
        ));
        registry.startReview(pid);
    }

    function test_activatePortfolio_requiresApproved() public {
        uint256 pid = _submit();
        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.SUBMITTED
        ));
        registry.activatePortfolio(pid);
    }

    function test_activatePortfolio_afterExpiry_reverts() public {
        uint256 pid = _submitToApproved();
        vm.warp(uint256(expiry)); // coverage window elapsed
        vm.prank(curator);
        vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
        registry.activatePortfolio(pid);
    }

    // =========== SENTINEL PAUSE ===========

    function test_pauseUnpause_bySentinel() public {
        uint256 pid = _submitToActive();

        vm.prank(sentinel);
        registry.pausePortfolio(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.PAUSED));
        assertFalse(registry.isAllocatable(pid)); // paused portfolios are not allocatable

        vm.prank(sentinel);
        registry.unpausePortfolio(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.ACTIVE));
        assertTrue(registry.isAllocatable(pid));
    }

    function test_pause_onlySentinel() public {
        uint256 pid = _submitToActive();
        bytes32 sentinelRole = protocolRoles.SENTINEL_ROLE();

        vm.prank(curator);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__UnauthorizedRole.selector, curator, sentinelRole
        ));
        registry.pausePortfolio(pid);
    }

    function test_pause_requiresActive() public {
        uint256 pid = _submitToApproved();
        vm.prank(sentinel);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.APPROVED
        ));
        registry.pausePortfolio(pid);
    }

    // =========== EXPIRY ===========

    function test_markExpired_afterWindow() public {
        uint256 pid = _submitToActive();

        vm.warp(uint256(expiry));
        vm.prank(attacker); // permissionless
        registry.markExpired(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.EXPIRED));
        assertFalse(registry.isAllocatable(pid));
    }

    function test_markExpired_fromPaused() public {
        uint256 pid = _submitToActive();
        vm.prank(sentinel);
        registry.pausePortfolio(pid);

        vm.warp(uint256(expiry) + 1);
        registry.markExpired(pid);
        assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.EXPIRED));
    }

    function test_markExpired_beforeWindow_reverts() public {
        uint256 pid = _submitToActive();
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__NotYetExpired.selector, pid, expiry
        ));
        registry.markExpired(pid);
    }

    function test_markExpired_wrongStatus_reverts() public {
        uint256 pid = _submitToApproved(); // not yet ACTIVE
        vm.warp(uint256(expiry));
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.APPROVED
        ));
        registry.markExpired(pid);
    }

    // =========== METADATA ===========

    function test_updateMetadata_byCedant_preApproval() public {
        uint256 pid = _submit();
        bytes32 newHash = keccak256("cession-agreement-v2");

        vm.prank(cedant);
        vm.expectEmit(true, false, false, true);
        emit PortfolioRegistry.PortfolioMetadataUpdated(pid, "ipfs://QmV2", newHash);
        registry.updateMetadata(pid, "ipfs://QmV2", newHash);

        PortfolioRegistry.Portfolio memory pf = registry.getPortfolio(pid);
        assertEq(pf.documentHash, newHash);
        assertEq(pf.metadataURI, "ipfs://QmV2");
    }

    function test_updateMetadata_notOwnPortfolio_reverts() public {
        uint256 pid = _submit();
        vm.prank(otherCedant); // holds cedant role but does not own this portfolio
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__NotCedantOfPortfolio.selector, pid, otherCedant
        ));
        registry.updateMetadata(pid, "ipfs://QmHijack", keccak256("x"));
    }

    function test_updateMetadata_afterApproval_reverts() public {
        uint256 pid = _submitToApproved();
        vm.prank(cedant);
        vm.expectRevert(abi.encodeWithSelector(
            PortfolioRegistry.PortfolioRegistry__InvalidStatus.selector, pid, PortfolioRegistry.PortfolioStatus.APPROVED
        ));
        registry.updateMetadata(pid, "ipfs://QmLate", keccak256("late"));
    }

    // =========== VIEWS ===========

    function test_getPortfolio_notFound_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(PortfolioRegistry.PortfolioRegistry__NotFound.selector, 999));
        registry.getPortfolio(999);
    }

    function test_isAllocatable_nonexistent_false() public view {
        assertFalse(registry.isAllocatable(999));
    }

    function test_isAllocatable_perStatus() public {
        uint256 pid = _submit();
        assertFalse(registry.isAllocatable(pid)); // SUBMITTED

        vm.prank(curator);
        registry.startReview(pid);
        assertFalse(registry.isAllocatable(pid)); // UNDER_REVIEW

        vm.prank(curator);
        registry.approvePortfolio(pid, EXPECTED_LOSS_6500);
        assertTrue(registry.isAllocatable(pid)); // APPROVED
    }

    // =========== FUZZ ===========

    function testFuzz_approve_lossBpsBounds(uint16 lossBps) public {
        uint256 pid = _submit();
        vm.prank(curator);
        registry.startReview(pid);

        if (lossBps > 10_000) {
            vm.prank(curator);
            vm.expectRevert(abi.encodeWithSelector(
                PortfolioRegistry.PortfolioRegistry__InvalidLossBps.selector, lossBps
            ));
            registry.approvePortfolio(pid, lossBps);
        } else {
            vm.prank(curator);
            registry.approvePortfolio(pid, lossBps);
            assertEq(registry.getPortfolio(pid).expectedLossBps, lossBps);
        }
    }

    function testFuzz_submit_coverageWindow(uint64 inception_, uint64 expiry_) public {
        PortfolioRegistry.SubmissionParams memory p = _params();
        p.inceptionTime = inception_;
        p.expiryTime = expiry_;

        if (expiry_ <= inception_) {
            vm.prank(cedant);
            vm.expectRevert(PortfolioRegistry.PortfolioRegistry__InvalidParams.selector);
            registry.submitPortfolio(p);
        } else {
            vm.prank(cedant);
            uint256 pid = registry.submitPortfolio(p);
            PortfolioRegistry.Portfolio memory pf = registry.getPortfolio(pid);
            assertEq(pf.inceptionTime, inception_);
            assertEq(pf.expiryTime, expiry_);
        }
    }

    function testFuzz_markExpired_timeBoundary(uint64 warpTo) public {
        uint256 pid = _submitToActive();
        warpTo = uint64(bound(warpTo, block.timestamp, uint256(expiry) * 2));
        vm.warp(warpTo);

        if (warpTo < expiry) {
            vm.expectRevert(abi.encodeWithSelector(
                PortfolioRegistry.PortfolioRegistry__NotYetExpired.selector, pid, expiry
            ));
            registry.markExpired(pid);
        } else {
            registry.markExpired(pid);
            assertEq(uint8(registry.getPortfolio(pid).status), uint8(PortfolioRegistry.PortfolioStatus.EXPIRED));
        }
    }
}
