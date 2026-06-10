// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {NavOracle} from "../src/NavOracle.sol";

/// @title NavOracleTest
/// @notice Phase 5 suite: oracle/sentinel/owner role gates, staleness guard,
///         deviation guard with anomaly auto-pause, sentinel waiver cycle,
///         confidence/score bounds and fuzz on time/deviation boundaries.
contract NavOracleTest is Test {
    ProtocolRoles public protocolRoles;
    PortfolioRegistry public portfolioRegistry;
    NavOracle public navOracle;

    address public admin = makeAddr("admin");
    address public oracleNode = makeAddr("brainoOracleNode");
    address public sentinel = makeAddr("sentinel");
    address public cedant = makeAddr("cedant");
    address public attacker = makeAddr("attacker");
    address public vaultAddr = makeAddr("vaultA");

    uint256 public pid;

    uint256 constant NAV_100K = 100_000e6;
    uint16 constant CONF_9000 = 9_000;
    bytes32 constant SOURCE_HASH = keccak256("braino-report-2026-06-10");

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        navOracle = new NavOracle(address(protocolRoles), address(portfolioRegistry));

        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        vm.stopPrank();

        // One existing portfolio for risk attestations
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026",
                metadataURI: "ipfs://QmDocs",
                documentHash: keccak256("docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: 1_000_000e6,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
    }

    function _publish(uint256 nav) internal {
        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, nav, CONF_9000, SOURCE_HASH);
    }

    // =========== ROLE GATES ===========

    function test_publishNav_onlyOracleRole() public {
        bytes32 oracleRole = protocolRoles.ORACLE_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__UnauthorizedRole.selector, attacker, oracleRole));
        navOracle.publishNav(vaultAddr, NAV_100K, CONF_9000, SOURCE_HASH);
    }

    function test_publishPortfolioRisk_onlyOracleRole() public {
        bytes32 oracleRole = protocolRoles.ORACLE_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__UnauthorizedRole.selector, attacker, oracleRole));
        navOracle.publishPortfolioRisk(pid, 6_500, CONF_9000, SOURCE_HASH);
    }

    function test_pauseUnpause_onlySentinel() public {
        bytes32 sentinelRole = protocolRoles.SENTINEL_ROLE();
        vm.prank(oracleNode); // oracle cannot pause (role separation)
        vm.expectRevert(
            abi.encodeWithSelector(NavOracle.NavOracle__UnauthorizedRole.selector, oracleNode, sentinelRole)
        );
        navOracle.pauseFeed(vaultAddr);

        vm.prank(sentinel);
        navOracle.pauseFeed(vaultAddr);
        assertTrue(navOracle.vaultFeedPaused(vaultAddr));

        vm.prank(sentinel);
        navOracle.unpauseFeed(vaultAddr);
        assertFalse(navOracle.vaultFeedPaused(vaultAddr));
    }

    function test_setGuards_onlyOwnerRole() public {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(sentinel);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__UnauthorizedRole.selector, sentinel, ownerRole));
        navOracle.setGuards(1 days, 2_000, 5_000);
    }

    // =========== PUBLISH & READ ===========

    function test_publishAndRead() public {
        vm.prank(oracleNode);
        vm.expectEmit(true, false, false, true);
        emit NavOracle.NavPublished(vaultAddr, NAV_100K, CONF_9000, SOURCE_HASH);
        navOracle.publishNav(vaultAddr, NAV_100K, CONF_9000, SOURCE_HASH);

        (uint256 nav, uint16 conf, uint64 updatedAt) = navOracle.getNav(vaultAddr);
        assertEq(nav, NAV_100K);
        assertEq(conf, CONF_9000);
        assertEq(updatedAt, uint64(block.timestamp));

        (bool valid, NavOracle.NavAttestation memory att) = navOracle.tryGetNav(vaultAddr);
        assertTrue(valid);
        assertEq(att.sourceHash, SOURCE_HASH);
    }

    function test_getNav_neverPublished_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__NoAttestation.selector, vaultAddr));
        navOracle.getNav(vaultAddr);

        (bool valid,) = navOracle.tryGetNav(vaultAddr);
        assertFalse(valid);
    }

    function test_publishRisk_andRead() public {
        vm.prank(oracleNode);
        vm.expectEmit(true, false, false, true);
        emit NavOracle.PortfolioRiskPublished(pid, 6_500, CONF_9000, SOURCE_HASH);
        navOracle.publishPortfolioRisk(pid, 6_500, CONF_9000, SOURCE_HASH);

        (uint16 risk, uint16 conf,) = navOracle.getPortfolioRisk(pid);
        assertEq(risk, 6_500);
        assertEq(conf, CONF_9000);
    }

    function test_publishRisk_nonexistentPortfolio_reverts() public {
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(PortfolioRegistry.PortfolioRegistry__NotFound.selector, 999));
        navOracle.publishPortfolioRisk(999, 6_500, CONF_9000, SOURCE_HASH);
    }

    // =========== VALIDITY BOUNDS ===========

    function test_publish_lowConfidence_reverts() public {
        uint16 minConf = navOracle.minConfidenceBps();
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__ConfidenceTooLow.selector, minConf - 1, minConf));
        navOracle.publishNav(vaultAddr, NAV_100K, minConf - 1, SOURCE_HASH);
    }

    function test_publish_invalidParams_revert() public {
        vm.startPrank(oracleNode);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.publishNav(address(0), NAV_100K, CONF_9000, SOURCE_HASH);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.publishNav(vaultAddr, NAV_100K, CONF_9000, bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__ScoreOutOfBounds.selector, 10_001));
        navOracle.publishNav(vaultAddr, NAV_100K, 10_001, SOURCE_HASH);

        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__ScoreOutOfBounds.selector, 10_001));
        navOracle.publishPortfolioRisk(pid, 10_001, CONF_9000, SOURCE_HASH);

        vm.stopPrank();
    }

    function test_constructor_zeroParams_revert() public {
        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        new NavOracle(address(0), address(portfolioRegistry));
        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        new NavOracle(address(protocolRoles), address(0));
    }

    // =========== STALENESS GUARD ===========

    function test_staleness_navUnusableAfterWindow() public {
        _publish(NAV_100K);
        uint64 maxStale = navOracle.maxStaleness();

        // Still fresh at the boundary
        vm.warp(block.timestamp + maxStale);
        (uint256 nav,,) = navOracle.getNav(vaultAddr);
        assertEq(nav, NAV_100K);

        // Stale one second past the boundary
        vm.warp(block.timestamp + 1);
        vm.expectRevert();
        navOracle.getNav(vaultAddr);

        (bool valid,) = navOracle.tryGetNav(vaultAddr);
        assertFalse(valid);
    }

    function test_staleness_riskUnusableAfterWindow() public {
        vm.prank(oracleNode);
        navOracle.publishPortfolioRisk(pid, 6_500, CONF_9000, SOURCE_HASH);

        vm.warp(block.timestamp + uint256(navOracle.maxStaleness()) + 1);
        vm.expectRevert();
        navOracle.getPortfolioRisk(pid);
    }

    // =========== DEVIATION GUARD & ANOMALY FLOW ===========

    function test_deviation_withinBound_accepted() public {
        _publish(NAV_100K);
        // +20% exactly = within bound (default maxDeviationBps = 2000)
        _publish(120_000e6);
        (uint256 nav,,) = navOracle.getNav(vaultAddr);
        assertEq(nav, 120_000e6);
    }

    function test_deviation_breach_notApplied_andAutoPaused() public {
        _publish(NAV_100K);

        // +25% deviation: anomaly
        vm.prank(oracleNode);
        vm.expectEmit(true, false, false, true);
        emit NavOracle.NavAnomalyDetected(vaultAddr, 125_000e6, NAV_100K, 2_500);
        navOracle.publishNav(vaultAddr, 125_000e6, CONF_9000, SOURCE_HASH);

        // Value NOT applied; feed paused; anomaly latched
        assertTrue(navOracle.vaultFeedPaused(vaultAddr));
        assertTrue(navOracle.vaultAnomalyFlagged(vaultAddr));
        assertEq(navOracle.rawNavAttestation(vaultAddr).nav, NAV_100K);

        // Reads revert while paused
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__FeedPaused.selector, vaultAddr));
        navOracle.getNav(vaultAddr);

        // Further publishes revert while paused
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(NavOracle.NavOracle__FeedPaused.selector, vaultAddr));
        navOracle.publishNav(vaultAddr, NAV_100K, CONF_9000, SOURCE_HASH);
    }

    function test_anomaly_sentinelReviewCycle() public {
        _publish(NAV_100K);

        // Anomalous publish: -40%
        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, 60_000e6, CONF_9000, SOURCE_HASH);
        assertTrue(navOracle.vaultAnomalyFlagged(vaultAddr));

        // Sentinel reviews: acknowledges deviation (one-shot waiver) + unpauses
        vm.prank(sentinel);
        vm.expectEmit(true, true, false, true);
        emit NavOracle.DeviationAcknowledged(vaultAddr, sentinel);
        navOracle.acknowledgeDeviation(vaultAddr);
        vm.prank(sentinel);
        navOracle.unpauseFeed(vaultAddr);
        assertFalse(navOracle.vaultAnomalyFlagged(vaultAddr));

        // Oracle republishes the reviewed value: waiver consumed, value applied
        _publish(60_000e6);
        (uint256 nav,,) = navOracle.getNav(vaultAddr);
        assertEq(nav, 60_000e6);
        assertFalse(navOracle.deviationWaiver(vaultAddr)); // one-shot

        // Next deviant publish (without waiver) trips the guard again
        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, 120_000e6, CONF_9000, SOURCE_HASH); // +100%
        assertTrue(navOracle.vaultFeedPaused(vaultAddr));
    }

    function test_unpause_withoutWaiver_deviationStillEnforced() public {
        _publish(NAV_100K);
        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, 200_000e6, CONF_9000, SOURCE_HASH); // anomaly

        // Sentinel unpauses WITHOUT acknowledging the deviation
        vm.prank(sentinel);
        navOracle.unpauseFeed(vaultAddr);

        // Same deviant value still rejected (guard intact)
        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, 200_000e6, CONF_9000, SOURCE_HASH);
        assertTrue(navOracle.vaultFeedPaused(vaultAddr));
        assertEq(navOracle.rawNavAttestation(vaultAddr).nav, NAV_100K);
    }

    // =========== GUARD CONFIGURATION ===========

    function test_setGuards_bounds() public {
        uint64 stalenessFloor = navOracle.STALENESS_FLOOR();
        uint64 stalenessCeiling = navOracle.STALENESS_CEILING();
        uint256 deviationCeiling = navOracle.DEVIATION_CEILING_BPS();

        vm.startPrank(admin);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.setGuards(stalenessFloor - 1, 2_000, 5_000);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.setGuards(stalenessCeiling + 1, 2_000, 5_000);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.setGuards(1 days, 0, 5_000);

        vm.expectRevert(NavOracle.NavOracle__InvalidParams.selector);
        navOracle.setGuards(1 days, deviationCeiling + 1, 5_000);

        vm.expectEmit(false, false, false, true);
        emit NavOracle.GuardsUpdated(2 days, 1_000, 7_000);
        navOracle.setGuards(2 days, 1_000, 7_000);

        vm.stopPrank();

        assertEq(navOracle.maxStaleness(), 2 days);
        assertEq(navOracle.maxDeviationBps(), 1_000);
        assertEq(navOracle.minConfidenceBps(), 7_000);
    }

    // =========== FUZZ ===========

    function testFuzz_deviationBoundary(uint256 newNav) public {
        _publish(NAV_100K);
        newNav = bound(newNav, 1, 1_000_000e6);

        uint256 diff = newNav > NAV_100K ? newNav - NAV_100K : NAV_100K - newNav;
        uint256 deviationBps = diff * 10_000 / NAV_100K;

        vm.prank(oracleNode);
        navOracle.publishNav(vaultAddr, newNav, CONF_9000, SOURCE_HASH);

        if (deviationBps > navOracle.maxDeviationBps()) {
            // Anomaly: not applied, paused
            assertTrue(navOracle.vaultFeedPaused(vaultAddr));
            assertEq(navOracle.rawNavAttestation(vaultAddr).nav, NAV_100K);
        } else {
            assertFalse(navOracle.vaultFeedPaused(vaultAddr));
            assertEq(navOracle.rawNavAttestation(vaultAddr).nav, newNav);
        }
    }

    function testFuzz_stalenessBoundary(uint64 elapsed) public {
        _publish(NAV_100K);
        uint64 maxStale = navOracle.maxStaleness();
        elapsed = uint64(bound(elapsed, 0, 90 days));

        vm.warp(block.timestamp + elapsed);

        (bool valid,) = navOracle.tryGetNav(vaultAddr);
        assertEq(valid, elapsed <= maxStale);
    }
}
