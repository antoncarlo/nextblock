// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {BordereauOracle} from "../../src/BordereauOracle.sol";
import {UmaBordereauOracle} from "../../src/UmaBordereauOracle.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOptimisticOracleV3} from "../mocks/MockOptimisticOracleV3.sol";

/// @title UmaBordereauHandler
/// @notice Bounded actions over the UMA-backed bordereau oracle and the UMA test double:
///         proposals by a cedant and by the oracle feed, disputes through the sentinel and
///         straight on UMA, time moving, settlement through this contract and straight on
///         UMA, UMA's ruling on disputes, bond and liveness reconfiguration, and callbacks
///         from impostors. Every action ends by draining the logs and checking each
///         assertion's status against the last one seen, so an illegal transition or a
///         duplicate event is recorded the moment it happens.
contract UmaBordereauHandler is Test {
    UmaBordereauOracle public bordereau;
    MockOptimisticOracleV3 public uma;
    MockUSDC public usdc;
    ProtocolRoles public protocolRoles;

    address public admin;
    address public cedant;
    address public oracleNode;
    address public sentinel;
    address public outsider;
    uint256 public portfolioId;

    /// @dev Every USDC ever created for the actors of this run.
    uint256 public ghost_minted;
    /// @dev Set when a status changed in a way the state machine forbids.
    bool public ghost_badTransition;
    /// @dev Set when an impostor's callback changed anything.
    bool public ghost_forgeryAccepted;
    /// @dev Set when a step the contract must accept was refused: the harness, or the contract, is broken.
    bool public ghost_harnessFailure;
    /// @dev Whole lifecycles driven to a terminal state.
    uint256 public ghost_cycles;
    mapping(uint256 => uint256) public ghost_finalizedEvents;
    mapping(uint256 => uint256) public ghost_rejectedEvents;
    mapping(uint256 => uint256) public ghost_settledEvents;
    mapping(uint256 => uint256) public ghost_bondedEvents;
    mapping(uint256 => uint8) internal _lastSeen;
    uint256 internal _seenCount;

    bytes32 internal constant FINALIZED_SIG = keccak256("AssertionFinalized(uint256,uint256,uint8)");
    bytes32 internal constant REJECTED_SIG = keccak256("AssertionRejected(uint256)");
    bytes32 internal constant SETTLED_SIG = keccak256("AssertionSettled(uint256,bytes32,bool,bool)");
    bytes32 internal constant BONDED_SIG = keccak256("AssertionBonded(uint256,bytes32,address,uint256)");

    constructor(
        UmaBordereauOracle bordereau_,
        MockOptimisticOracleV3 uma_,
        MockUSDC usdc_,
        ProtocolRoles roles_,
        address admin_,
        address cedant_,
        address oracleNode_,
        address sentinel_,
        address outsider_,
        uint256 portfolioId_
    ) {
        bordereau = bordereau_;
        uma = uma_;
        usdc = usdc_;
        protocolRoles = roles_;
        admin = admin_;
        cedant = cedant_;
        oracleNode = oracleNode_;
        sentinel = sentinel_;
        outsider = outsider_;
        portfolioId = portfolioId_;
        vm.recordLogs();
    }

    // ------------------------------------------------------------------ actions

    function propose(bool byFeed, uint8 kind, bytes32 dataHash, uint256 declared) external {
        (bool ok,) = _tryPropose(byFeed, kind, dataHash, declared);
        if (!ok) ghost_harnessFailure = true;
        _afterAction();
    }

    /// @dev One whole life of an assertion, ending in a terminal state. Every step is one the
    ///      contract must accept; a step that is refused marks the harness as broken instead of
    ///      vanishing as a quiet revert, which is how an invariant suite ends up passing on an
    ///      empty set. Paths: 0 undisputed and finalized here; 1 disputed by the sentinel and UMA
    ///      rules as drawn; 2 the same with UMA ruling false; 3 undisputed and settled straight on
    ///      UMA; 4 disputed and settled straight on UMA.
    function fullCycle(uint8 path, bool byFeed, uint256 declared, bool rulesTrue) external {
        path = uint8(bound(path, 0, 4));
        (bool ok, uint256 id) = _tryPropose(byFeed, path, keccak256(abi.encode(declared, path)), declared);
        if (!ok) {
            ghost_harnessFailure = true;
            return;
        }
        bytes32 umaId = bordereau.umaAssertionOf(id);
        _afterAction(); // observe it as proposed before it moves

        if (path == 1 || path == 2) {
            _fund(sentinel, bordereau.bondOf(id));
            vm.prank(sentinel);
            try bordereau.disputeAssertion(id, "cycle") {}
            catch {
                ghost_harnessFailure = true;
                return;
            }
            _afterAction(); // and as disputed
            rulesTrue = path == 1 ? rulesTrue : false;
            uma.resolve(umaId, rulesTrue);
            vm.prank(outsider);
            try bordereau.settleDisputed(id) {}
            catch {
                ghost_harnessFailure = true;
                return;
            }
        } else if (path == 4) {
            _fund(outsider, bordereau.bondOf(id));
            vm.prank(outsider);
            try uma.disputeAssertion(umaId, outsider) {}
            catch {
                ghost_harnessFailure = true;
                return;
            }
            _afterAction();
            uma.resolve(umaId, rulesTrue);
            vm.prank(outsider);
            try uma.settleAssertion(umaId) {}
            catch {
                ghost_harnessFailure = true;
                return;
            }
        } else {
            uint64 deadline = bordereau.getAssertion(id).livenessDeadline;
            if (block.timestamp < deadline) vm.warp(deadline);
            rulesTrue = true;
            vm.prank(outsider);
            if (path == 0) {
                try bordereau.finalizeAssertion(id) {}
                catch {
                    ghost_harnessFailure = true;
                    return;
                }
            } else {
                try uma.settleAssertion(umaId) {}
                catch {
                    ghost_harnessFailure = true;
                    return;
                }
            }
        }

        // Whatever the path, the assertion is now terminal, and a replay of UMA's callback,
        // in either direction, changes nothing.
        BordereauOracle.AssertionStatus st = bordereau.getAssertion(id).status;
        if (st != BordereauOracle.AssertionStatus.FINALIZED && st != BordereauOracle.AssertionStatus.REJECTED) {
            ghost_harnessFailure = true;
        }
        ghost_cycles++;
        bytes32 h = keccak256(abi.encode(bordereau.getAssertion(id)));
        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, rulesTrue);
        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, !rulesTrue);
        if (h != keccak256(abi.encode(bordereau.getAssertion(id)))) ghost_badTransition = true;
        _afterAction();
    }

    function dispute(uint256 seed) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        uint256 id = seed % n;
        _fund(sentinel, bordereau.bondOf(id));
        vm.prank(sentinel);
        try bordereau.disputeAssertion(id, "handler") {} catch {}
        _afterAction();
    }

    /// @dev Anyone may dispute straight on UMA; this contract learns of it by callback.
    function disputeOnUma(uint256 seed) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        uint256 id = seed % n;
        _fund(outsider, bordereau.bondOf(id));
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.prank(outsider);
        try uma.disputeAssertion(umaId, outsider) {} catch {}
        _afterAction();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 5 days));
        _afterAction();
    }

    function finalize(uint256 seed) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        vm.prank(outsider);
        try bordereau.finalizeAssertion(seed % n) {} catch {}
        _afterAction();
    }

    /// @dev Anyone may settle straight on UMA.
    function settleOnUma(uint256 seed) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        bytes32 umaId = bordereau.umaAssertionOf(seed % n);
        vm.prank(outsider);
        try uma.settleAssertion(umaId) {} catch {}
        _afterAction();
    }

    /// @dev Play UMA's oracle, then settle the dispute through this contract.
    function ruleAndSettle(uint256 seed, bool assertedTruthfully) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        uint256 id = seed % n;
        uma.resolve(bordereau.umaAssertionOf(id), assertedTruthfully);
        vm.prank(outsider);
        try bordereau.settleDisputed(id) {} catch {}
        _afterAction();
    }

    /// @dev UMA rules without anyone settling here; a later settlement on UMA must be enough.
    function ruleOnly(uint256 seed, bool assertedTruthfully) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        uma.resolve(bordereau.umaAssertionOf(seed % n), assertedTruthfully);
        _afterAction();
    }

    function setBond(uint256 amount) external {
        vm.prank(admin);
        bordereau.setBondAmount(bound(amount, 0, 500e6));
        _afterAction();
    }

    function setUmaFloor(uint256 amount) external {
        uma.setMinimumBond(address(usdc), bound(amount, 0, 500e6));
        _afterAction();
    }

    function setLiveness(uint256 secs) external {
        vm.prank(admin);
        bordereau.setLiveness(uint64(bound(secs, 1 hours, 30 days)));
        _afterAction();
    }

    /// @dev Impostors replaying or forging the callbacks UMA alone may make.
    function forgeCallback(uint256 seed, bool truthfully) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        bytes32 umaId = bordereau.umaAssertionOf(seed % n);
        uint256 before_ = uint256(keccak256(abi.encode(bordereau.getAssertion(seed % n))));
        vm.prank(outsider);
        try bordereau.assertionResolvedCallback(umaId, truthfully) {
            ghost_forgeryAccepted = true;
        } catch {}
        vm.prank(cedant);
        try bordereau.assertionDisputedCallback(umaId) {
            ghost_forgeryAccepted = true;
        } catch {}
        if (before_ != uint256(keccak256(abi.encode(bordereau.getAssertion(seed % n))))) {
            ghost_forgeryAccepted = true;
        }
        _afterAction();
    }

    /// @dev UMA itself replaying a callback it already made must change nothing.
    function replayCallbackFromUma(uint256 seed, bool truthfully) external {
        uint256 n = bordereau.getAssertionCount();
        if (n == 0) return;
        uint256 id = seed % n;
        BordereauOracle.AssertionStatus st = bordereau.getAssertion(id).status;
        if (st != BordereauOracle.AssertionStatus.FINALIZED && st != BordereauOracle.AssertionStatus.REJECTED) return;
        bytes32 h = keccak256(abi.encode(bordereau.getAssertion(id)));
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.prank(address(uma));
        bordereau.assertionResolvedCallback(umaId, truthfully);
        if (h != keccak256(abi.encode(bordereau.getAssertion(id)))) ghost_badTransition = true;
        _afterAction();
    }

    // ------------------------------------------------------------------ internals

    /// @dev A proposal the contract must accept: the proposer is funded for exactly the bond.
    function _tryPropose(bool byFeed, uint8 kind, bytes32 dataHash, uint256 declared)
        internal
        returns (bool ok, uint256 id)
    {
        address who = byFeed ? oracleNode : cedant;
        if (dataHash == bytes32(0)) dataHash = keccak256("fallback");
        declared = bound(declared, 0, 10_000_000e6);
        _fund(who, bordereau.effectiveBond());
        BordereauOracle.AssertionType assertionType = BordereauOracle.AssertionType(bound(kind, 0, 3));
        vm.prank(who);
        try bordereau.proposeAssertion(portfolioId, assertionType, dataHash, "ipfs://bordereau", declared) returns (
            uint256 newId
        ) {
            return (true, newId);
        } catch {
            return (false, 0);
        }
    }

    function _fund(address who, uint256 amount) internal {
        if (usdc.balanceOf(who) < amount) {
            uint256 top = amount - usdc.balanceOf(who);
            usdc.mint(who, top);
            ghost_minted += top;
        }
        vm.prank(who);
        usdc.approve(address(bordereau), type(uint256).max);
        vm.prank(who);
        usdc.approve(address(uma), type(uint256).max);
    }

    /// @dev PROPOSED(0) -> DISPUTED(1) -> FINALIZED(2) | REJECTED(3); PROPOSED -> FINALIZED(2). Never back.
    function _afterAction() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(bordereau)) continue;
            bytes32 sig = logs[i].topics[0];
            if (sig == FINALIZED_SIG) ghost_finalizedEvents[uint256(logs[i].topics[1])]++;
            else if (sig == REJECTED_SIG) ghost_rejectedEvents[uint256(logs[i].topics[1])]++;
            else if (sig == SETTLED_SIG) ghost_settledEvents[uint256(logs[i].topics[1])]++;
            else if (sig == BONDED_SIG) ghost_bondedEvents[uint256(logs[i].topics[1])]++;
        }

        uint256 n = bordereau.getAssertionCount();
        for (uint256 id = 0; id < n; id++) {
            uint8 now_ = uint8(bordereau.getAssertion(id).status);
            if (id >= _seenCount) {
                if (now_ != 0) ghost_badTransition = true; // born anywhere but PROPOSED
            } else {
                uint8 was = _lastSeen[id];
                if (was == 2 || was == 3) {
                    if (now_ != was) ghost_badTransition = true; // terminal states are absorbing
                } else if (was == 1) {
                    if (now_ == 0) ghost_badTransition = true; // no going back
                }
            }
            _lastSeen[id] = now_;
        }
        _seenCount = n;
    }
}

/// @title UmaBordereauInvariantTest
/// @notice The accounting and state-machine invariants of the UMA-backed bordereau oracle.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 100
/// forge-config: default.invariant.fail-on-revert = false
contract UmaBordereauInvariantTest is StdInvariant, Test {
    ProtocolRoles internal protocolRoles;
    PortfolioRegistry internal portfolioRegistry;
    MockUSDC internal usdc;
    MockOptimisticOracleV3 internal uma;
    UmaBordereauOracle internal bordereau;
    UmaBordereauHandler internal handler;

    address internal admin = makeAddr("admin");
    address internal cedant = makeAddr("cedant");
    address internal oracleNode = makeAddr("oracleNode");
    address internal sentinel = makeAddr("sentinel");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        usdc = new MockUSDC();
        uma = new MockOptimisticOracleV3(0.5e18);
        uma.setWhitelisted(address(usdc), true);
        bordereau = new UmaBordereauOracle(
            address(protocolRoles), address(portfolioRegistry), address(uma), address(usdc), 100e6
        );
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        vm.stopPrank();

        vm.prank(cedant);
        uint256 pid = portfolioRegistry.submitPortfolio(
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

        handler = new UmaBordereauHandler(
            bordereau, uma, usdc, protocolRoles, admin, cedant, oracleNode, sentinel, outsider, pid
        );

        bytes4[] memory selectors = new bytes4[](14);
        selectors[0] = handler.propose.selector;
        selectors[1] = handler.dispute.selector;
        selectors[2] = handler.disputeOnUma.selector;
        selectors[3] = handler.warp.selector;
        selectors[4] = handler.finalize.selector;
        selectors[5] = handler.settleOnUma.selector;
        selectors[6] = handler.ruleAndSettle.selector;
        selectors[7] = handler.ruleOnly.selector;
        selectors[8] = handler.setBond.selector;
        selectors[9] = handler.setUmaFloor.selector;
        selectors[10] = handler.setLiveness.selector;
        selectors[11] = handler.forgeCallback.selector;
        selectors[12] = handler.replayCallbackFromUma.selector;
        selectors[13] = handler.fullCycle.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function _actors() internal view returns (address[5] memory a) {
        a = [cedant, oracleNode, sentinel, outsider, address(handler)];
    }

    /// @notice This contract never keeps a bond: it only ever relays it to UMA in the same call.
    function invariant_bordereauHoldsNoUsdcAndNoAllowance() public view {
        assertEq(usdc.balanceOf(address(bordereau)), 0, "a bond stayed in the oracle contract");
        assertEq(usdc.allowance(address(bordereau), address(uma)), 0, "an approval was left behind");
    }

    /// @notice USDC is neither created nor lost: what the actors hold, plus what UMA holds,
    ///         plus the burned share at UMA's store, is everything that was ever minted.
    function invariant_usdcIsConserved() public view {
        uint256 held = usdc.balanceOf(address(uma)) + usdc.balanceOf(uma.store());
        address[5] memory a = _actors();
        for (uint256 i = 0; i < a.length; i++) {
            held += usdc.balanceOf(a[i]);
        }
        assertEq(held, handler.ghost_minted(), "USDC was created or destroyed");
    }

    /// @notice UMA holds exactly the bonds of live assertions: one bond while proposed, two while
    ///         disputed, none once settled. No bond is stranded and none is paid twice.
    function invariant_umaHoldsExactlyTheLiveBonds() public view {
        uint256 expected;
        uint256 n = bordereau.getAssertionCount();
        for (uint256 id = 0; id < n; id++) {
            BordereauOracle.AssertionStatus st = bordereau.getAssertion(id).status;
            if (st == BordereauOracle.AssertionStatus.PROPOSED) expected += bordereau.bondOf(id);
            else if (st == BordereauOracle.AssertionStatus.DISPUTED) expected += 2 * bordereau.bondOf(id);
        }
        assertEq(usdc.balanceOf(address(uma)), expected, "UMA's balance does not match the live bonds");
    }

    /// @notice A status only moves forward and terminal statuses never change.
    function invariant_statusOnlyMovesForward() public view {
        assertFalse(handler.ghost_badTransition(), "an illegal status transition happened");
    }

    /// @notice No duplicate finalization: every assertion emitted at most one terminal event,
    ///         exactly matching its status, and exactly one settlement event once terminal.
    function invariant_noDuplicateFinalization() public view {
        uint256 n = bordereau.getAssertionCount();
        for (uint256 id = 0; id < n; id++) {
            BordereauOracle.AssertionStatus st = bordereau.getAssertion(id).status;
            uint256 fin = handler.ghost_finalizedEvents(id);
            uint256 rej = handler.ghost_rejectedEvents(id);
            uint256 set = handler.ghost_settledEvents(id);
            assertEq(fin, st == BordereauOracle.AssertionStatus.FINALIZED ? 1 : 0, "finalized events != status");
            assertEq(rej, st == BordereauOracle.AssertionStatus.REJECTED ? 1 : 0, "rejected events != status");
            assertEq(
                set,
                (st == BordereauOracle.AssertionStatus.FINALIZED || st == BordereauOracle.AssertionStatus.REJECTED)
                    ? 1
                    : 0,
                "settled events != terminal"
            );
            assertEq(handler.ghost_bondedEvents(id), 1, "an assertion must be bonded exactly once");
        }
    }

    /// @notice The bridge to UMA is one to one: our ids and UMA's ids pair up without overlap,
    ///         and each UMA assertion points back at this contract.
    function invariant_umaMappingIsOneToOne() public view {
        uint256 n = bordereau.getAssertionCount();
        assertEq(uma.allAssertionsLength(), n, "UMA has a different number of assertions");
        for (uint256 id = 0; id < n; id++) {
            bytes32 umaId = bordereau.umaAssertionOf(id);
            assertEq(umaId, uma.allAssertions(id), "mapping out of order");
            assertEq(uma.getAssertion(umaId).callbackRecipient, address(bordereau), "callback does not return here");
            assertEq(uma.getAssertion(umaId).bond, bordereau.bondOf(id), "bond recorded differs from the one at UMA");
        }
    }

    /// @notice Only UMA's callbacks move a status; an impostor's never does.
    function invariant_forgedCallbacksChangeNothing() public view {
        assertFalse(handler.ghost_forgeryAccepted(), "a callback from someone else was accepted");
    }

    /// @notice What the readers see as the latest finalized assertion really is finalized, and it
    ///         exists as soon as any assertion of that portfolio and type is finalized.
    function invariant_latestFinalizedIsFinalized() public view {
        uint256 n = bordereau.getAssertionCount();
        for (uint8 k = 0; k < 4; k++) {
            BordereauOracle.AssertionType kind = BordereauOracle.AssertionType(k);
            bool any;
            for (uint256 id = 0; id < n; id++) {
                BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
                if (a.assertionType == kind && a.status == BordereauOracle.AssertionStatus.FINALIZED) any = true;
            }
            try bordereau.latestFinalized(0, kind) returns (BordereauOracle.Assertion memory latest) {
                assertTrue(any, "a latest exists with nothing finalized");
                assertEq(uint8(latest.status), uint8(BordereauOracle.AssertionStatus.FINALIZED));
                assertEq(uint8(latest.assertionType), k);
                assertTrue(bordereau.isFinalized(latest.assertionId));
            } catch {
                assertFalse(any, "something is finalized but readers see nothing");
            }
        }
    }

    /// @notice A step the contract must accept was never refused. Without this, a contract that
    ///         reverts on every proposal leaves an empty set that satisfies every other invariant.
    function invariant_harnessIsLive() public view {
        assertFalse(handler.ghost_harnessFailure(), "a step the contract must accept was refused");
    }

    /// @notice The harness reaches every terminal state: this does not depend on the fuzzer's luck.
    function test_harnessReachesEveryTerminalState() public {
        handler.fullCycle(0, false, 1, true); // undisputed, finalized here
        handler.fullCycle(1, true, 2, true); // disputed, UMA rules true
        handler.fullCycle(2, false, 3, true); // disputed, UMA rules false
        handler.fullCycle(3, true, 4, true); // undisputed, settled on UMA
        handler.fullCycle(4, false, 5, false); // disputed on UMA, rules false

        assertFalse(handler.ghost_harnessFailure(), "a step was refused");
        assertFalse(handler.ghost_badTransition(), "an illegal transition");
        assertEq(handler.ghost_cycles(), 5, "cycles completed");
        assertEq(bordereau.getAssertionCount(), 5);

        uint256 finalized;
        uint256 rejected;
        for (uint256 id = 0; id < 5; id++) {
            BordereauOracle.AssertionStatus st = bordereau.getAssertion(id).status;
            if (st == BordereauOracle.AssertionStatus.FINALIZED) finalized++;
            if (st == BordereauOracle.AssertionStatus.REJECTED) rejected++;
        }
        assertEq(finalized, 3, "paths 0, 1 and 3 finalize");
        assertEq(rejected, 2, "paths 2 and 4 are rejected");
        invariant_usdcIsConserved();
        invariant_umaHoldsExactlyTheLiveBonds();
        invariant_noDuplicateFinalization();
        invariant_latestFinalizedIsFinalized();
    }
}
