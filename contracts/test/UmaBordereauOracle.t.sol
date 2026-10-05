// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {UmaBordereauOracle} from "../src/UmaBordereauOracle.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IOptimisticOracleV3} from "../src/interfaces/uma/IOptimisticOracleV3.sol";
import {MockOptimisticOracleV3} from "./mocks/MockOptimisticOracleV3.sol";

/// @title UmaBordereauOracleTest
/// @notice Unit, revert and fuzz tests for the UMA-backed bordereau oracle, against a test
///         double of UMA's oracle (the integration with the real one is in test/fork).
///         Covers the module's mandatory tests: proposer role, liveness, dispute,
///         finalization, duplicate assertion, no duplicate finalization, and the bond
///         conservation the stand-in could not have: this contract never keeps a bond.
contract UmaBordereauOracleTest is Test {
    ProtocolRoles internal protocolRoles;
    PortfolioRegistry internal portfolioRegistry;
    MockUSDC internal usdc;
    MockOptimisticOracleV3 internal uma;
    UmaBordereauOracle internal bordereau;

    address internal admin = makeAddr("admin");
    address internal cedant = makeAddr("cedant");
    address internal otherCedant = makeAddr("otherCedant");
    address internal oracleNode = makeAddr("oracleNode");
    address internal sentinel = makeAddr("sentinel");
    address internal committee = makeAddr("committee");
    address internal outsider = makeAddr("outsider");

    uint256 internal pid;
    bytes32 internal ownerRole;
    bytes32 internal sentinelRole;

    bytes32 internal constant DATA_HASH = keccak256("premium-bordereau-2026-Q2");
    uint256 internal constant DECLARED = 100_000e6;
    uint256 internal constant BOND = 100e6;
    uint256 internal constant BURN = 0.5e18;

    event AssertionProposed(
        uint256 indexed assertionId,
        uint256 indexed portfolioId,
        BordereauOracle.AssertionType assertionType,
        bytes32 dataHash,
        uint256 declaredAmount,
        address proposer,
        uint64 livenessDeadline
    );
    event AssertionBonded(
        uint256 indexed assertionId, bytes32 indexed umaAssertionId, address indexed asserter, uint256 bond
    );
    event AssertionDisputed(uint256 indexed assertionId, address indexed disputer, string reason);
    event DisputeReasonGiven(uint256 indexed assertionId, address indexed sentinel, string reason);
    event AssertionFinalized(
        uint256 indexed assertionId, uint256 indexed portfolioId, BordereauOracle.AssertionType assertionType
    );
    event AssertionRejected(uint256 indexed assertionId);
    event AssertionSettled(
        uint256 indexed assertionId, bytes32 indexed umaAssertionId, bool assertedTruthfully, bool wasDisputed
    );
    event LivenessUpdated(uint64 liveness);
    event BondAmountUpdated(uint256 bondAmount);

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        usdc = new MockUSDC();
        uma = new MockOptimisticOracleV3(BURN);
        uma.setWhitelisted(address(usdc), true);
        bordereau = new UmaBordereauOracle(
            address(protocolRoles), address(portfolioRegistry), address(uma), address(usdc), BOND
        );

        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), otherCedant);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        ownerRole = protocolRoles.OWNER_ROLE();
        sentinelRole = protocolRoles.SENTINEL_ROLE();
        vm.stopPrank();

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
                cededPremium: DECLARED,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );

        _fund(cedant, 10_000e6);
        _fund(otherCedant, 10_000e6);
        _fund(oracleNode, 10_000e6);
        _fund(sentinel, 10_000e6);
        _fund(outsider, 10_000e6);
    }

    // ------------------------------------------------------------------ helpers

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(bordereau), type(uint256).max);
        vm.prank(who);
        usdc.approve(address(uma), type(uint256).max);
    }

    function _propose() internal returns (uint256 id) {
        vm.prank(cedant);
        id = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://QmBordereau", DECLARED
        );
    }

    function _status(uint256 id) internal view returns (BordereauOracle.AssertionStatus) {
        return bordereau.getAssertion(id).status;
    }

    function _contains(bytes memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > haystack.length) return false;
        for (uint256 i = 0; i + n.length <= haystack.length; i++) {
            bool hit = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (haystack[i + j] != n[j]) {
                    hit = false;
                    break;
                }
            }
            if (hit) return true;
        }
        return false;
    }

    function _sum() internal view returns (uint256) {
        return usdc.balanceOf(cedant) + usdc.balanceOf(otherCedant) + usdc.balanceOf(oracleNode)
            + usdc.balanceOf(sentinel) + usdc.balanceOf(outsider) + usdc.balanceOf(address(uma))
            + usdc.balanceOf(uma.store()) + usdc.balanceOf(address(bordereau));
    }

    // ------------------------------------------------------------------ construction

    function test_constructor_wiresAndAsksUmaToSyncTheCurrency() public view {
        assertEq(address(bordereau.protocolRoles()), address(protocolRoles));
        assertEq(address(bordereau.portfolioRegistry()), address(portfolioRegistry));
        assertEq(address(bordereau.oracle()), address(uma));
        assertEq(address(bordereau.bondCurrency()), address(usdc));
        assertEq(bordereau.identifier(), uma.DEFAULT_IDENTIFIER());
        assertEq(bordereau.liveness(), 2 days);
        assertEq(bordereau.bondAmount(), BOND);
        assertEq(bordereau.maxBond(), 1_000_000e6, "a million whole units of a 6-decimal currency");
        assertTrue(uma.synced(address(usdc)), "UMA cached the currency at deployment");
    }

    function test_constructor_revertsOnZeroAndNonContractWiring() public {
        address r = address(protocolRoles);
        address p = address(portfolioRegistry);
        address o = address(uma);
        address c = address(usdc);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(address(0), p, o, c, BOND);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(r, address(0), o, c, BOND);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(r, p, address(0), c, BOND);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(r, p, o, address(0), BOND);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(r, p, makeAddr("eoa"), c, BOND);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(r, p, o, makeAddr("eoa"), BOND);
    }

    function test_constructor_revertsAboveTheBondCeiling() public {
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        new UmaBordereauOracle(
            address(protocolRoles), address(portfolioRegistry), address(uma), address(usdc), 1_000_000e6 + 1
        );
    }

    function test_constructor_revertsWhenUmaDoesNotAcceptTheCurrency() public {
        MockUSDC other = new MockUSDC();
        vm.expectRevert(bytes("Unsupported currency"));
        new UmaBordereauOracle(address(protocolRoles), address(portfolioRegistry), address(uma), address(other), BOND);
    }

    // ------------------------------------------------------------------ configuration

    function test_setLiveness_boundsAndRole() public {
        vm.prank(admin);
        vm.expectEmit(address(bordereau));
        emit LivenessUpdated(3 days);
        bordereau.setLiveness(3 days);
        assertEq(bordereau.liveness(), 3 days);

        vm.startPrank(admin);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        bordereau.setLiveness(1 hours - 1);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        bordereau.setLiveness(30 days + 1);
        bordereau.setLiveness(1 hours);
        bordereau.setLiveness(30 days);
        vm.stopPrank();

        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__UnauthorizedRole.selector, outsider, ownerRole
            )
        );
        bordereau.setLiveness(2 days);
    }

    function test_setBondAmount_boundsAndRole() public {
        vm.prank(admin);
        vm.expectEmit(address(bordereau));
        emit BondAmountUpdated(5e6);
        bordereau.setBondAmount(5e6);
        assertEq(bordereau.bondAmount(), 5e6);

        uint256 ceiling = bordereau.maxBond();
        vm.startPrank(admin);
        bordereau.setBondAmount(0);
        bordereau.setBondAmount(ceiling);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        bordereau.setBondAmount(ceiling + 1);
        vm.stopPrank();

        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__UnauthorizedRole.selector, sentinel, ownerRole
            )
        );
        bordereau.setBondAmount(1);
    }

    function test_syncUma_isPermissionless() public {
        vm.prank(outsider);
        bordereau.syncUma();
        assertTrue(uma.synced(address(usdc)));
    }

    function test_effectiveBond_isTheHigherOfTheSettingAndUmasMinimum() public {
        assertEq(bordereau.effectiveBond(), BOND);
        uma.setMinimumBond(address(usdc), BOND * 3);
        assertEq(bordereau.effectiveBond(), BOND * 3, "UMA's floor wins when it is higher");
        uma.setMinimumBond(address(usdc), BOND / 2);
        assertEq(bordereau.effectiveBond(), BOND, "the protocol's setting wins when it is higher");
    }

    // ------------------------------------------------------------------ proposal

    function test_propose_putsTheBondBehindTheClaimAndKeepsNothing() public {
        uint256 before_ = usdc.balanceOf(cedant);
        uint64 deadline = uint64(block.timestamp) + 2 days;

        vm.expectEmit(true, true, false, true, address(bordereau));
        emit AssertionProposed(
            0, pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, DECLARED, cedant, deadline
        );
        uint256 id = _propose();

        assertEq(id, 0);
        assertEq(bordereau.getAssertionCount(), 1);
        assertEq(usdc.balanceOf(cedant), before_ - BOND, "the bond came from the proposer");
        assertEq(usdc.balanceOf(address(uma)), BOND, "and sits in UMA");
        assertEq(usdc.balanceOf(address(bordereau)), 0, "this contract keeps no bond");
        assertEq(usdc.allowance(address(bordereau), address(uma)), 0, "no approval is left behind");
        assertEq(bordereau.bondOf(id), BOND);

        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
        assertEq(a.portfolioId, pid);
        assertEq(uint8(a.assertionType), uint8(BordereauOracle.AssertionType.PREMIUM_BORDEREAU));
        assertEq(a.dataHash, DATA_HASH);
        assertEq(a.dataURI, "ipfs://QmBordereau");
        assertEq(a.declaredAmount, DECLARED);
        assertEq(a.proposer, cedant);
        assertEq(a.disputer, address(0));
        assertEq(a.livenessDeadline, deadline);
        assertEq(uint8(a.status), uint8(BordereauOracle.AssertionStatus.PROPOSED));
    }

    function test_propose_opensTheUmaAssertionWithTheRightTerms() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        assertTrue(umaId != bytes32(0));

        IOptimisticOracleV3.Assertion memory u = uma.getAssertion(umaId);
        assertEq(u.asserter, cedant, "the bond returns to the proposer");
        assertEq(u.callbackRecipient, address(bordereau));
        assertEq(address(u.currency), address(usdc));
        assertEq(u.bond, BOND);
        assertEq(u.expirationTime, uint64(block.timestamp) + 2 days);
        assertEq(u.domainId, bordereau.DOMAIN_ID());
        assertEq(u.identifier, bordereau.identifier());
        assertEq(u.disputer, address(0));
        assertEq(
            u.escalationManagerSettings.escalationManager, address(0), "UMA's oracle decides, not a protocol arbiter"
        );
    }

    function test_propose_theClaimNamesWhatTheAsserterVouchesFor() public {
        _propose();
        bytes memory claim = uma.lastClaim();
        assertTrue(_contains(claim, "NextBlock bordereau assertion #0"), "numbered");
        assertTrue(_contains(claim, "premium bordereau"), "the kind of dataset");
        assertTrue(_contains(claim, "portfolio #0"), "the portfolio");
        assertTrue(_contains(claim, "ipfs://QmBordereau"), "the pointer");
        assertTrue(_contains(claim, "100000000000 USDC base units"), "the declared amount");
        assertTrue(_contains(claim, vm.toLowercase(vm.toString(DATA_HASH))), "the dataset hash");
        assertTrue(_contains(claim, vm.toLowercase(vm.toString(cedant))), "who asserts it");
        assertTrue(_contains(claim, "true and complete"), "what is being vouched for");
    }

    function test_propose_emitsTheBondEvent() public {
        bytes32 expectedUmaId;
        vm.recordLogs();
        uint256 id = _propose();
        expectedUmaId = bordereau.umaAssertionOf(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == AssertionBonded.selector) {
                assertEq(logs[i].topics[1], bytes32(id));
                assertEq(logs[i].topics[2], expectedUmaId);
                assertEq(logs[i].topics[3], bytes32(uint256(uint160(cedant))));
                assertEq(abi.decode(logs[i].data, (uint256)), BOND);
                found = true;
            }
        }
        assertTrue(found, "AssertionBonded emitted");
    }

    function test_propose_theOracleFeedSpeaksForAnyPortfolio() public {
        vm.prank(oracleNode);
        uint256 id =
            bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.CLAIMS_BORDEREAU, DATA_HASH, "ipfs://x", 1);
        assertEq(bordereau.getAssertion(id).proposer, oracleNode);
        assertEq(usdc.balanceOf(address(uma)), BOND, "the node posts the bond, and gets it back");
    }

    function test_propose_aCedantSpeaksOnlyForItsOwnBook_F12() public {
        vm.prank(otherCedant);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__NotPortfolioCedant.selector, pid, otherCedant)
        );
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);
    }

    function test_propose_unauthorizedCallerRefused() public {
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__UnauthorizedProposer.selector, outsider)
        );
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__UnauthorizedProposer.selector, sentinel)
        );
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);
    }

    function test_propose_rejectsBadInput() public {
        vm.startPrank(cedant);
        vm.expectRevert(UmaBordereauOracle.UmaBordereauOracle__InvalidParams.selector);
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, bytes32(0), "ipfs://x", 1);

        bytes memory long = new bytes(257);
        for (uint256 i = 0; i < long.length; i++) {
            long[i] = "a";
        }
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__DataURITooLong.selector, 257));
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, string(long), 1);

        // exactly the limit is fine
        bytes memory edge = new bytes(256);
        for (uint256 i = 0; i < edge.length; i++) {
            edge[i] = "a";
        }
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, string(edge), 1);

        vm.expectRevert(); // portfolio 99 does not exist
        bordereau.proposeAssertion(99, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);
        vm.stopPrank();
    }

    function test_propose_withoutAllowanceOrBalanceRevertsAndRecordsNothing() public {
        address broke = makeAddr("broke");
        vm.startPrank(admin);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), broke);
        vm.stopPrank();

        vm.prank(broke);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientAllowance.selector);
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);

        vm.prank(broke);
        usdc.approve(address(bordereau), type(uint256).max);
        vm.prank(broke);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientBalance.selector);
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://x", 1);

        assertEq(bordereau.getAssertionCount(), 0, "the failed proposals left no record");
        assertEq(uma.allAssertionsLength(), 0);
    }

    function test_propose_aZeroBondIsPossibleWhereUmaAllowsIt() public {
        vm.prank(admin);
        bordereau.setBondAmount(0);
        uint256 before_ = usdc.balanceOf(cedant);
        uint256 id = _propose();
        assertEq(usdc.balanceOf(cedant), before_, "nothing was pulled");
        assertEq(bordereau.bondOf(id), 0);
        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(id);
        assertTrue(bordereau.isFinalized(id));
    }

    function test_propose_theSameDatasetTwiceMakesTwoIndependentAssertions() public {
        uint256 a = _propose();
        uint256 b = _propose();
        assertTrue(a != b);
        assertTrue(bordereau.umaAssertionOf(a) != bordereau.umaAssertionOf(b));
        assertEq(usdc.balanceOf(address(uma)), 2 * BOND, "each carries its own bond");

        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(a);
        assertTrue(bordereau.isFinalized(a));
        assertFalse(bordereau.isFinalized(b), "finalizing one does not finalize the other");
        bordereau.finalizeAssertion(b);
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, b);
    }

    // ------------------------------------------------------------------ finalization

    function test_finalize_beforeLivenessReverts_atTheDeadlineWorks() public {
        uint256 id = _propose();
        uint64 deadline = bordereau.getAssertion(id).livenessDeadline;

        vm.warp(deadline - 1);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__LivenessActive.selector, id, deadline)
        );
        bordereau.finalizeAssertion(id);

        vm.warp(deadline);
        vm.prank(outsider);
        bordereau.finalizeAssertion(id);
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.FINALIZED));
    }

    function test_finalize_returnsTheBondAndRecordsTheLatest() public {
        uint256 before_ = usdc.balanceOf(cedant);
        uint256 id = _propose();
        vm.warp(block.timestamp + 2 days);

        vm.expectEmit(true, true, false, true, address(bordereau));
        emit AssertionFinalized(id, pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        bordereau.finalizeAssertion(id);

        assertEq(usdc.balanceOf(cedant), before_, "the bond is back with the proposer");
        assertEq(usdc.balanceOf(address(uma)), 0);
        assertEq(usdc.balanceOf(address(bordereau)), 0);
        assertTrue(bordereau.isFinalized(id));
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, id);
    }

    function test_finalize_cannotBeDoneTwice() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id,
                BordereauOracle.AssertionStatus.FINALIZED
            )
        );
        bordereau.finalizeAssertion(id);
    }

    function test_finalize_whenSomeoneSettlesOnUmaDirectly_theCallbackStillFinalizes() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.warp(block.timestamp + 2 days);

        vm.prank(outsider);
        uma.settleAssertion(umaId); // not through this contract

        assertTrue(bordereau.isFinalized(id), "the callback recorded it");
        // the keeper arriving afterwards finds nothing to do, and says so
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id,
                BordereauOracle.AssertionStatus.FINALIZED
            )
        );
        bordereau.finalizeAssertion(id);
    }

    function test_finalize_unknownAssertionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__AssertionNotFound.selector, 7));
        bordereau.finalizeAssertion(7);
    }

    // ------------------------------------------------------------------ dispute

    function test_dispute_theSentinelMatchesTheBond() public {
        uint256 id = _propose();
        uint256 sentinelBefore = usdc.balanceOf(sentinel);

        vm.prank(sentinel);
        vm.expectEmit(true, true, false, true, address(bordereau));
        emit DisputeReasonGiven(id, sentinel, "premium total does not match the statements");
        bordereau.disputeAssertion(id, "premium total does not match the statements");

        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
        assertEq(uint8(a.status), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        assertEq(a.disputer, sentinel);
        assertEq(usdc.balanceOf(sentinel), sentinelBefore - BOND, "the sentinel put up a matching bond");
        assertEq(usdc.balanceOf(address(uma)), 2 * BOND);
        assertEq(usdc.balanceOf(address(bordereau)), 0, "still nothing kept here");
        assertEq(uma.getAssertion(bordereau.umaAssertionOf(id)).disputer, sentinel);
    }

    function test_dispute_onlyTheSentinelThroughThisContract() public {
        uint256 id = _propose();
        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__UnauthorizedRole.selector, outsider, sentinelRole
            )
        );
        bordereau.disputeAssertion(id, "x");
        vm.prank(committee);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__UnauthorizedRole.selector, committee, sentinelRole
            )
        );
        bordereau.disputeAssertion(id, "x");
    }

    function test_dispute_windowBoundary_UmaRefusesAtExpiry() public {
        uint256 id = _propose();
        uint64 deadline = bordereau.getAssertion(id).livenessDeadline;

        vm.warp(deadline - 1);
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "last second");

        uint256 id2 = _propose();
        uint64 deadline2 = bordereau.getAssertion(id2).livenessDeadline;
        vm.warp(deadline2);
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__LivenessElapsed.selector, id2, deadline2)
        );
        bordereau.disputeAssertion(id2, "too late");
    }

    function test_dispute_notTwice_notWhenFinalized() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "first");
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id,
                BordereauOracle.AssertionStatus.DISPUTED
            )
        );
        bordereau.disputeAssertion(id, "second");

        uint256 id2 = _propose();
        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(id2);
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id2,
                BordereauOracle.AssertionStatus.FINALIZED
            )
        );
        bordereau.disputeAssertion(id2, "after the fact");
    }

    function test_dispute_withoutTheBondRevertsAndLeavesTheAssertionProposed() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        usdc.approve(address(bordereau), 0);
        vm.prank(sentinel);
        vm.expectPartialRevert(IERC20Errors.ERC20InsufficientAllowance.selector);
        bordereau.disputeAssertion(id, "no bond");
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.PROPOSED));
    }

    function test_dispute_ifUmaDoesNotCallBack_nothingIsRecordedAndTheBondIsNotStranded() public {
        uint256 id = _propose();
        uint256 sentinelBefore = usdc.balanceOf(sentinel);
        // UMA wraps callbacks in try/catch, so a failing recipient cannot block the dispute on UMA's side;
        // this contract must then refuse to pretend it knows about it.
        vm.mockCallRevert(
            address(bordereau), abi.encodeWithSelector(bordereau.assertionDisputedCallback.selector), "boom"
        );

        vm.prank(sentinel);
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__DisputeNotRecorded.selector, id));
        bordereau.disputeAssertion(id, "x");

        assertEq(usdc.balanceOf(sentinel), sentinelBefore, "the whole transaction reverted, bond included");
        assertEq(usdc.balanceOf(address(bordereau)), 0);
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.PROPOSED));
    }

    function test_dispute_anyoneCanDisputeDirectlyOnUma_andTheCallbackRecordsIt() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);

        vm.prank(outsider);
        uma.disputeAssertion(umaId, outsider);

        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
        assertEq(uint8(a.status), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        assertEq(a.disputer, outsider);
    }

    function test_dispute_aDisputedAssertionCannotBeFinalizedByTheKeeper() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "x");
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id,
                BordereauOracle.AssertionStatus.DISPUTED
            )
        );
        bordereau.finalizeAssertion(id);
    }

    // ------------------------------------------------------------------ resolution by UMA

    function test_resolve_umaRulesTrue_theAssertionStands_theProposerGetsBothBondsLessTheBurn() public {
        uint256 id = _propose();
        uint256 cedantAfterPropose = usdc.balanceOf(cedant);
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "x");
        bytes32 umaId = bordereau.umaAssertionOf(id);
        uint256 total = _sum();

        uma.resolve(umaId, true);
        vm.expectEmit(true, true, false, true, address(bordereau));
        emit AssertionSettled(id, umaId, true, true);
        bordereau.settleDisputed(id);

        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.FINALIZED));
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, id);
        uint256 fee = BOND * BURN / 1e18;
        assertEq(
            usdc.balanceOf(cedant),
            cedantAfterPropose + 2 * BOND - fee,
            "the winner takes both bonds less the burned share"
        );
        assertEq(usdc.balanceOf(uma.store()), fee);
        assertEq(usdc.balanceOf(address(bordereau)), 0);
        assertEq(_sum(), total, "no USDC created or lost");
    }

    function test_resolve_umaRulesFalse_theAssertionIsRejected_theDisputerWins() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "x");
        uint256 sentinelAfterDispute = usdc.balanceOf(sentinel);
        bytes32 umaId = bordereau.umaAssertionOf(id);
        uint256 total = _sum();

        uma.resolve(umaId, false);
        vm.expectEmit(true, false, false, true, address(bordereau));
        emit AssertionRejected(id);
        bordereau.settleDisputed(id);

        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.REJECTED));
        assertFalse(bordereau.isFinalized(id));
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__NoFinalizedAssertion.selector,
                pid,
                BordereauOracle.AssertionType.PREMIUM_BORDEREAU
            )
        );
        bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        uint256 fee = BOND * BURN / 1e18;
        assertEq(usdc.balanceOf(sentinel), sentinelAfterDispute + 2 * BOND - fee);
        assertEq(_sum(), total);
    }

    function test_resolve_beforeUmaHasRuledNothingChanges() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "x");
        vm.expectRevert(bytes("Price not available"));
        bordereau.settleDisputed(id);
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.DISPUTED));
    }

    function test_resolve_settleDisputedOnlyAppliesToDisputedAssertions() public {
        uint256 id = _propose();
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__InvalidStatus.selector,
                id,
                BordereauOracle.AssertionStatus.PROPOSED
            )
        );
        bordereau.settleDisputed(id);
    }

    function test_resolve_theClaimsCommitteeHasNoSayOverAChallengedClaim() public {
        // The stand-in let the committee resolve a dispute; here the function does not exist.
        (bool ok,) = address(bordereau).call(abi.encodeWithSignature("resolveDispute(uint256,bool)", 0, true));
        assertFalse(ok, "no committee override of UMA's ruling");
    }

    // ------------------------------------------------------------------ callbacks

    function test_callbacks_onlyUmaMayCallThem() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__NotOracle.selector, outsider));
        bordereau.assertionResolvedCallback(bytes32(uint256(1)), true);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__NotOracle.selector, admin));
        bordereau.assertionDisputedCallback(bytes32(uint256(1)));
    }

    function test_callbacks_aForgedFinalizationFromAnyoneButUmaIsImpossible() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.prank(cedant); // the proposer itself
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__NotOracle.selector, cedant));
        bordereau.assertionResolvedCallback(umaId, true);
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.PROPOSED));
    }

    function test_callbacks_unknownIdsAreIgnoredNotReverted() public {
        vm.startPrank(address(uma));
        bordereau.assertionResolvedCallback(keccak256("not ours"), true);
        bordereau.assertionDisputedCallback(keccak256("not ours"));
        vm.stopPrank();
        assertEq(bordereau.getAssertionCount(), 0);
    }

    function test_callbacks_aReplayedResolutionIsANoOp_noDuplicateFinalization() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(id);

        vm.recordLogs();
        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, true); // replay
        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, false); // and a contradicting one
        assertEq(vm.getRecordedLogs().length, 0, "nothing emitted, nothing changed");
        assertEq(
            uint8(_status(id)),
            uint8(BordereauOracle.AssertionStatus.FINALIZED),
            "a finalized assertion stays finalized"
        );
    }

    function test_callbacks_aRejectedAssertionCannotBeRevivedByALateCallback() public {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "x");
        uma.resolve(umaId, false);
        bordereau.settleDisputed(id);

        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, true);
        assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.REJECTED));
    }

    // ------------------------------------------------------------------ views

    function test_views_unknownAssertionAndNoFinalizedAssertionRevert() public {
        vm.expectRevert(abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__AssertionNotFound.selector, 3));
        bordereau.getAssertion(3);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__NoFinalizedAssertion.selector,
                pid,
                BordereauOracle.AssertionType.POLICY_BORDEREAU
            )
        );
        bordereau.latestFinalized(pid, BordereauOracle.AssertionType.POLICY_BORDEREAU);
        assertFalse(bordereau.isFinalized(3));
    }

    function test_theReadSurfaceMatchesTheStandIn_soTheLensAndTheKeeperReadItUnchanged() public {
        // Same selectors as BordereauOracle for everything the readers call.
        assertEq(bordereau.getAssertion.selector, BordereauOracle.getAssertion.selector);
        assertEq(bordereau.getAssertionCount.selector, BordereauOracle.getAssertionCount.selector);
        assertEq(bordereau.isFinalized.selector, BordereauOracle.isFinalized.selector);
        assertEq(bordereau.latestFinalized.selector, BordereauOracle.latestFinalized.selector);
        assertEq(bordereau.finalizeAssertion.selector, BordereauOracle.finalizeAssertion.selector);
        assertEq(bordereau.proposeAssertion.selector, BordereauOracle.proposeAssertion.selector);
        assertEq(bordereau.disputeAssertion.selector, BordereauOracle.disputeAssertion.selector);
        // and the record decodes as the stand-in's record does
        uint256 id = _propose();
        (bool ok, bytes memory data) = address(bordereau).staticcall(abi.encodeCall(BordereauOracle.getAssertion, (id)));
        assertTrue(ok);
        BordereauOracle.Assertion memory a = abi.decode(data, (BordereauOracle.Assertion));
        assertEq(a.assertionId, id);
    }

    /// @dev Stale data: the latest finalized assertion is the one finalized last, not the one with
    ///      the highest id, exactly as in the stand-in. An older claim that UMA rules true after a
    ///      newer one has stood becomes the reference; the record carries `proposedAt` so a reader
    ///      that cares about staleness can see it.
    function test_latestFinalized_isTheLastFinalized_notTheHighestId() public {
        uint256 older = _propose();
        vm.warp(block.timestamp + 1 hours);
        uint256 newer = _propose();

        vm.prank(sentinel);
        bordereau.disputeAssertion(older, "challenge the older one");

        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(newer);
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, newer);

        uma.resolve(bordereau.umaAssertionOf(older), true);
        bordereau.settleDisputed(older);

        BordereauOracle.Assertion memory latest =
            bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(latest.assertionId, older, "the one finalized last wins");
        assertTrue(latest.proposedAt < bordereau.getAssertion(newer).proposedAt, "and its age is on the record");
    }

    /// @dev Different types of the same portfolio keep separate references.
    function test_latestFinalized_isPerPortfolioAndType() public {
        uint256 premium = _propose();
        vm.prank(cedant);
        uint256 claims = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.CLAIMS_BORDEREAU, DATA_HASH, "ipfs://claims", 1
        );
        vm.warp(block.timestamp + 2 days);
        bordereau.finalizeAssertion(claims);

        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.CLAIMS_BORDEREAU).assertionId, claims);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmaBordereauOracle.UmaBordereauOracle__NoFinalizedAssertion.selector,
                pid,
                BordereauOracle.AssertionType.PREMIUM_BORDEREAU
            )
        );
        bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);

        bordereau.finalizeAssertion(premium);
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, premium);
    }

    // ------------------------------------------------------------------ fuzz

    /// @dev The effective bond is always the higher of the setting and UMA's floor.
    function testFuzz_effectiveBondIsTheMax(uint256 setting, uint256 floor_) public {
        setting = bound(setting, 0, bordereau.maxBond());
        floor_ = bound(floor_, 0, 10_000_000e6);
        vm.prank(admin);
        bordereau.setBondAmount(setting);
        uma.setMinimumBond(address(usdc), floor_);
        assertEq(bordereau.effectiveBond(), setting > floor_ ? setting : floor_);
    }

    /// @dev Dispute is possible strictly before the deadline, finalization at or after it, for any window.
    function testFuzz_windowBoundaries(uint64 window, uint32 elapsed) public {
        window = uint64(bound(window, 1 hours, 30 days));
        elapsed = uint32(bound(elapsed, 0, 31 days));
        vm.prank(admin);
        bordereau.setLiveness(window);
        uint256 id = _propose();
        uint64 deadline = bordereau.getAssertion(id).livenessDeadline;
        vm.warp(block.timestamp + elapsed);

        if (block.timestamp < deadline) {
            vm.expectRevert(
                abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__LivenessActive.selector, id, deadline)
            );
            bordereau.finalizeAssertion(id);
            vm.prank(sentinel);
            bordereau.disputeAssertion(id, "in time");
            assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        } else {
            vm.prank(sentinel);
            vm.expectRevert(
                abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__LivenessElapsed.selector, id, deadline)
            );
            bordereau.disputeAssertion(id, "too late");
            bordereau.finalizeAssertion(id);
            assertEq(uint8(_status(id)), uint8(BordereauOracle.AssertionStatus.FINALIZED));
        }
    }

    /// @dev For any bond, floor, dispute choice and ruling: USDC is conserved, this contract
    ///      ends with nothing, the loser of a dispute is the one who pays, and an undisputed
    ///      assertion costs the proposer nothing.
    function testFuzz_bondConservation(uint96 setting, uint96 floor_, bool disputed, bool umaRulesTrue) public {
        uint256 bondSetting = bound(setting, 0, 1_000e6);
        uint256 minBond = bound(floor_, 0, 1_000e6);
        vm.prank(admin);
        bordereau.setBondAmount(bondSetting);
        uma.setMinimumBond(address(usdc), minBond);
        uint256 bond = bondSetting > minBond ? bondSetting : minBond;
        uint256 total = _sum();
        uint256 cedantStart = usdc.balanceOf(cedant);
        uint256 sentinelStart = usdc.balanceOf(sentinel);

        uint256 id = _propose();
        assertEq(bordereau.bondOf(id), bond);

        if (disputed) {
            vm.prank(sentinel);
            bordereau.disputeAssertion(id, "fuzz");
            uma.resolve(bordereau.umaAssertionOf(id), umaRulesTrue);
            bordereau.settleDisputed(id);
            uint256 fee = bond * BURN / 1e18;
            if (umaRulesTrue) {
                assertEq(
                    usdc.balanceOf(cedant), cedantStart + bond - fee, "proposer nets the loser's bond less the burn"
                );
                assertEq(usdc.balanceOf(sentinel), sentinelStart - bond);
            } else {
                assertEq(usdc.balanceOf(cedant), cedantStart - bond);
                assertEq(usdc.balanceOf(sentinel), sentinelStart + bond - fee);
            }
        } else {
            vm.warp(block.timestamp + 2 days);
            bordereau.finalizeAssertion(id);
            assertEq(usdc.balanceOf(cedant), cedantStart, "an undisputed assertion costs nothing");
        }

        assertEq(usdc.balanceOf(address(bordereau)), 0, "this contract never keeps a bond");
        assertEq(usdc.balanceOf(address(uma)), 0, "UMA holds nothing once settled");
        assertEq(_sum(), total, "USDC conserved");
    }
}
