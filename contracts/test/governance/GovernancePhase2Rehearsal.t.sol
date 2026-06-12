// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../../src/ProtocolTimelock.sol";

/// @title GovernancePhase2RehearsalTest
/// @author Anton Carlo Santoro
/// @notice Deterministic, CI-safe rehearsal of the Governance Phase 2
///         handover (docs/GOVERNANCE_PHASE2.md). The Base Sepolia staging
///         posture is replicated locally, then the full sequence is proven:
///         rehearsal timelocked operation, Stage A reversible key
///         separation, Stage B irreversible deployer renounce, post-handover
///         control via the timelock only, and the sentinel emergency path
///         staying outside the timelock.
/// @dev Tests can never broadcast: `forge test` has no broadcast path by
///      construction, so this rehearsal is incapable of touching a live
///      chain. The fork-mode variant lives in test/fork/.
contract GovernancePhase2RehearsalTest is Test, ProtocolRoleConstants {
    uint256 internal constant MIN_DELAY = 3600; // staging timelock delay
    bytes32 internal constant NO_PRED = bytes32(0);
    bytes32 internal constant SALT = bytes32(0);

    address internal deployer = makeAddr("deployer");
    address internal safe = makeAddr("safe");
    address internal opsCurator = makeAddr("opsCurator");
    address internal opsSentinel = makeAddr("opsSentinel");
    address internal opsCommittee = makeAddr("opsCommittee");
    address internal opsKycOperator = makeAddr("opsKycOperator");
    address internal opsOracle = makeAddr("opsOracle");
    address internal opsAllocator = makeAddr("opsAllocator");
    address internal opsCedant = makeAddr("opsCedant");

    ProtocolRoles internal roles;
    ProtocolTimelock internal timelock;

    bytes32[7] internal operationalRoles;
    address[7] internal dedicatedHolders;

    function setUp() public {
        // Replicate the verified staging posture (GovernanceCheck output,
        // 2026-06-12): deployer holds OWNER + DEFAULT_ADMIN + every
        // operational role; the timelock holds OWNER + DEFAULT_ADMIN; the
        // Safe is proposer/executor/canceller and holds nothing directly.
        vm.startPrank(deployer);
        roles = new ProtocolRoles(deployer);

        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = safe;
        timelock = new ProtocolTimelock(MIN_DELAY, proposers, executors, address(0));

        operationalRoles = [
            UNDERWRITING_CURATOR_ROLE,
            ALLOCATOR_ROLE,
            SENTINEL_ROLE,
            CLAIMS_COMMITTEE_ROLE,
            AUTHORIZED_CEDANT_ROLE,
            KYC_OPERATOR_ROLE,
            ORACLE_ROLE
        ];
        dedicatedHolders = [opsCurator, opsAllocator, opsSentinel, opsCommittee, opsCedant, opsKycOperator, opsOracle];

        for (uint256 i = 0; i < operationalRoles.length; i++) {
            roles.grantRole(operationalRoles[i], deployer);
        }
        roles.grantRole(OWNER_ROLE, address(timelock));
        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock));
        vm.stopPrank();
    }

    // --- Posture detection (mirrors GovernanceCheck) ---

    function test_Posture_MatchesVerifiedStaging() public view {
        assertTrue(roles.hasRole(OWNER_ROLE, deployer), "deployer owner");
        assertTrue(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), deployer), "deployer admin");
        for (uint256 i = 0; i < operationalRoles.length; i++) {
            assertTrue(roles.hasRole(operationalRoles[i], deployer), "deployer operational");
        }
        assertTrue(roles.hasRole(OWNER_ROLE, address(timelock)), "timelock owner");
        assertTrue(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock)), "timelock admin");
        assertFalse(roles.hasRole(OWNER_ROLE, safe), "safe holds nothing directly");
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), safe), "safe proposer");
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), safe), "safe executor");
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), safe), "safe canceller");
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)), "self admin");
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "deployer not tl admin");
        assertEq(timelock.getMinDelay(), MIN_DELAY, "min delay");
    }

    // --- Step 1: rehearsal timelocked operation ---

    function _timelocked(address target, bytes memory data) internal {
        vm.prank(safe);
        timelock.schedule(target, 0, data, NO_PRED, SALT, MIN_DELAY);
        vm.warp(block.timestamp + MIN_DELAY);
        vm.prank(safe);
        timelock.execute(target, 0, data, NO_PRED, SALT);
    }

    function test_Step1_RehearsalTimelockedGrant() public {
        bytes memory data = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, opsKycOperator));
        vm.prank(safe);
        timelock.schedule(address(roles), 0, data, NO_PRED, SALT, MIN_DELAY);

        // Delay is enforced: execution before maturity reverts.
        vm.warp(block.timestamp + MIN_DELAY - 1);
        vm.prank(safe);
        vm.expectRevert();
        timelock.execute(address(roles), 0, data, NO_PRED, SALT);

        vm.warp(block.timestamp + 1);
        vm.prank(safe);
        timelock.execute(address(roles), 0, data, NO_PRED, SALT);
        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, opsKycOperator), "rehearsal grant applied");
    }

    // --- Stage A: reversible key separation ---

    function _stageA() internal {
        vm.startPrank(deployer);
        for (uint256 i = 0; i < operationalRoles.length; i++) {
            roles.grantRole(operationalRoles[i], dedicatedHolders[i]);
            roles.revokeRole(operationalRoles[i], deployer);
        }
        vm.stopPrank();
    }

    function test_StageA_KeySeparation_IsReversible() public {
        _stageA();
        for (uint256 i = 0; i < operationalRoles.length; i++) {
            assertTrue(roles.hasRole(operationalRoles[i], dedicatedHolders[i]), "dedicated holds");
            assertFalse(roles.hasRole(operationalRoles[i], deployer), "deployer released");
        }
        // Reversible while Stage B has not run: the deployer still owns the
        // role admin and can re-grant itself, which is exactly why Stage A
        // must precede the irreversible renounce.
        vm.prank(deployer);
        roles.grantRole(SENTINEL_ROLE, deployer);
        assertTrue(roles.hasRole(SENTINEL_ROLE, deployer), "stage A reversible pre-renounce");
        vm.prank(deployer);
        roles.revokeRole(SENTINEL_ROLE, deployer);
    }

    // --- Stage B: irreversible renounce, separated from Stage A ---

    function _stageB() internal {
        // Runbook precondition (mirrors GovernanceMigration phase 2 guard):
        // never renounce unless the timelock already holds both roles.
        require(roles.hasRole(OWNER_ROLE, address(timelock)), "guard: timelock owner");
        require(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock)), "guard: timelock admin");
        vm.startPrank(deployer);
        roles.renounceRole(OWNER_ROLE, deployer);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);
        vm.stopPrank();
    }

    function test_StageB_RenounceRemovesAllDeployerPower() public {
        _stageA();
        _stageB();

        assertFalse(roles.hasRole(OWNER_ROLE, deployer), "owner renounced");
        assertFalse(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), deployer), "admin renounced");
        for (uint256 i = 0; i < operationalRoles.length; i++) {
            assertFalse(roles.hasRole(operationalRoles[i], deployer), "no operational residue");
        }

        // Irreversible for the EOA: any direct admin action now reverts.
        vm.prank(deployer);
        vm.expectRevert();
        roles.grantRole(OWNER_ROLE, deployer);
        vm.prank(deployer);
        vm.expectRevert();
        roles.grantRole(KYC_OPERATOR_ROLE, deployer);
    }

    function test_PostHandover_TimelockGovernsAlone() public {
        _stageA();
        _stageB();

        // The timelock path keeps full administrative capability.
        address newOperator = makeAddr("newOperator");
        _timelocked(address(roles), abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newOperator)));
        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, newOperator), "timelock governs after handover");

        // And it can also revoke, proving two-way control.
        _timelocked(address(roles), abi.encodeCall(IAccessControl.revokeRole, (KYC_OPERATOR_ROLE, newOperator)));
        assertFalse(roles.hasRole(KYC_OPERATOR_ROLE, newOperator), "timelock revoke works");
    }

    function test_PostHandover_SentinelEmergencyStaysDirect() public {
        _stageA();
        _stageB();
        // The dedicated sentinel holds its role directly: emergency powers
        // require no timelock hop (risk-reducing path must stay immediate).
        assertTrue(roles.hasRole(SENTINEL_ROLE, opsSentinel), "sentinel direct");
        // ProtocolRoles.requireRole is the gate modules consult; it must pass
        // for the dedicated sentinel with no scheduling involved.
        roles.requireRole(SENTINEL_ROLE, opsSentinel);
    }

    function test_StageB_GuardBlocksRenounceWithoutTimelockOwnership() public {
        // Negative model: on a fresh ProtocolRoles where the timelock was
        // never granted, the runbook guard must stop Stage B outright.
        vm.prank(deployer);
        ProtocolRoles bare = new ProtocolRoles(deployer);
        assertFalse(bare.hasRole(OWNER_ROLE, address(timelock)), "timelock not owner on bare roles");
        vm.expectRevert(bytes("guard: timelock owner"));
        this.externalStageBGuard(bare);
    }

    /// @dev external so expectRevert catches the require in a call frame.
    function externalStageBGuard(ProtocolRoles target) external view {
        require(target.hasRole(OWNER_ROLE, address(timelock)), "guard: timelock owner");
    }
}
