// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {ProtocolTimelock} from "../../../src/ProtocolTimelock.sol";
import {VaultAllocator} from "../../../src/VaultAllocator.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";
import {NavOracle} from "../../../src/NavOracle.sol";
import {MockUSDC} from "../../../src/MockUSDC.sol";

/// @title GovernanceAgent — A1
/// @author Anton Carlo Santoro
/// @notice Protocol governance, acting only through the timelock.
///
/// @dev Governance is the role that can change the rules, so the thing worth
///      proving is not that it can, but that it cannot do so quietly. Every
///      parameter change here goes schedule -> wait -> execute, and the agent
///      tries at each step to skip the waiting.
///
///      The premature-execution attempt is the load-bearing one. A delay that
///      can be jumped is a delay in the documentation only, and the whole
///      argument for handing OWNER_ROLE to a timelock rests on it: LPs are told
///      they will see a rule change coming before it lands. Time is advanced by
///      exactly the configured minimum and no more, so the run does not drift
///      past the tenor of the books it is exercising.
///
///      Governance also reaches for the two powers it must never hold: moving
///      LP capital, and deciding a claim. Neither is timelocked because neither
///      should be reachable at all.
contract GovernanceAgent is BaseAgent {
    ProtocolTimelock internal immutable timelock;
    VaultAllocator internal immutable allocator;
    InsuranceVault internal immutable vault;
    ClaimManager internal immutable claims;
    NavOracle internal immutable nav;
    MockUSDC internal immutable usdc;

    address internal immutable stranger;

    /// @notice Ghost: operations scheduled.
    uint256 public ghostScheduled;
    /// @notice Ghost: operations executed after maturing.
    uint256 public ghostExecuted;
    /// @notice True if an operation executed before its delay had elapsed.
    bool public executedBeforeMaturity;
    /// @notice True if an address without the proposer role scheduled anything.
    bool public strangerScheduled;
    /// @notice True if governance ever moved LP capital.
    bool public governanceMovedFunds;
    /// @notice True if governance ever decided a claim.
    bool public governanceDecidedClaim;

    /// @notice Pending operation, so execute can find what schedule created.
    bytes internal pendingData;
    address internal pendingTarget;
    bytes32 internal pendingSalt;
    uint256 internal pendingReadyAt;
    bool internal hasPending;

    uint256 private salt = 1;

    constructor(
        ProtocolTimelock timelock_,
        VaultAllocator allocator_,
        InsuranceVault vault_,
        ClaimManager claims_,
        NavOracle nav_,
        MockUSDC usdc_,
        address governanceKey,
        address stranger_
    ) {
        timelock = timelock_;
        allocator = allocator_;
        vault = vault_;
        claims = claims_;
        nav = nav_;
        usdc = usdc_;
        stranger = stranger_;
        actors.push(governanceKey);
        _track(this.scheduleParameterChange.selector);
        _track(this.executeWhenMatured.selector);
        _track(this.executeBeforeMaturity.selector);
        _track(this.scheduleAsStranger.selector);
        _track(this.reachForFundsAndClaims.selector);
    }

    /// @notice Queue a parameter change through the timelock.
    function scheduleParameterChange(uint256 choiceSeed, uint256 valueSeed) external {
        if (hasPending) return;

        (address target, bytes memory data) = _pickChange(choiceSeed, valueSeed);
        bytes32 s = keccak256(abi.encode("gov", salt++));
        uint256 delay = timelock.getMinDelay();

        vm.prank(actors[0]);
        try timelock.schedule(target, 0, data, bytes32(0), s, delay) {
            pendingTarget = target;
            pendingData = data;
            pendingSalt = s;
            pendingReadyAt = block.timestamp + delay;
            hasPending = true;
            ghostScheduled += 1;
            _record(this.scheduleParameterChange.selector, true);
        } catch {
            _record(this.scheduleParameterChange.selector, false);
        }
    }

    /// @notice Execute a queued change once its delay has run.
    /// @dev Advances by exactly the shortfall. A larger jump would age every NAV
    ///      attestation and expire the books the other agents are working, which
    ///      would look like governance breaking the run rather than time passing.
    function executeWhenMatured() external {
        if (!hasPending) return;
        if (block.timestamp < pendingReadyAt) {
            vm.warp(pendingReadyAt);
        }

        vm.prank(actors[0]);
        try timelock.execute(pendingTarget, 0, pendingData, bytes32(0), pendingSalt) {
            ghostExecuted += 1;
            hasPending = false;
            _record(this.executeWhenMatured.selector, true);
        } catch {
            _record(this.executeWhenMatured.selector, false);
        }
    }

    /// @notice Negative perimeter: execute without waiting.
    /// @dev The single claim the timelock exists to make. If this ever succeeds,
    ///      the delay is a comment.
    function executeBeforeMaturity() external {
        if (!hasPending) return;
        if (block.timestamp >= pendingReadyAt) return; // already matured, proves nothing

        vm.prank(actors[0]);
        try timelock.execute(pendingTarget, 0, pendingData, bytes32(0), pendingSalt) {
            executedBeforeMaturity = true;
            hasPending = false;
            _record(this.executeBeforeMaturity.selector, true);
        } catch {
            _record(this.executeBeforeMaturity.selector, false);
        }
    }

    /// @notice Negative perimeter: an address with no proposer role queues work.
    function scheduleAsStranger(uint256 choiceSeed, uint256 valueSeed) external {
        (address target, bytes memory data) = _pickChange(choiceSeed, valueSeed);

        vm.prank(stranger);
        try timelock.schedule(target, 0, data, bytes32(0), keccak256(abi.encode("stranger", salt++)), 1 hours) {
            strangerScheduled = true;
            _record(this.scheduleAsStranger.selector, true);
        } catch {
            _record(this.scheduleAsStranger.selector, false);
        }
    }

    /// @notice Negative perimeter: the two powers governance must never hold.
    /// @dev Not routed through the timelock on purpose. These are not slow
    ///      powers that need announcing — they are powers that should not exist,
    ///      and scheduling them would only prove the queue works.
    function reachForFundsAndClaims(uint256 amountSeed, uint256 idSeed) external {
        address gov = actors[0];
        uint256 amount = _bounded(amountSeed, 1e6, 250_000e6);
        uint256 claimId = _bounded(idSeed, 0, 20);
        uint256 before = usdc.balanceOf(gov);

        vm.startPrank(gov);
        try vault.withdraw(amount, gov, gov) {
            if (usdc.balanceOf(gov) > before) governanceMovedFunds = true;
        } catch {}
        try vault.redeem(amount, gov, gov) {
            if (usdc.balanceOf(gov) > before) governanceMovedFunds = true;
        } catch {}
        try claims.approveClaim(claimId, amount) {
            governanceDecidedClaim = true;
        } catch {}
        try nav.publishNav(address(vault), 1_000_000e6, 9_000, keccak256("gov_nav")) {
            // Publishing is the attestor's job; governance holding it would let
            // one key set the value of the book and then act on it.
            governanceDecidedClaim = true;
        } catch {}
        vm.stopPrank();

        _record(this.reachForFundsAndClaims.selector, true);
    }

    /// @dev Three real parameter changes rather than one, so the queue is not
    ///      exercised against a single calldata shape.
    function _pickChange(uint256 choiceSeed, uint256 valueSeed)
        internal
        view
        returns (address target, bytes memory data)
    {
        uint256 choice = choiceSeed % 3;
        if (choice == 0) {
            uint256 cap = _bounded(valueSeed, 1_000_000e6, 100_000_000e6);
            return (address(vault), abi.encodeCall(vault.setDepositCap, (cap)));
        }
        if (choice == 1) {
            // Kept inside sane bands: the point is that the change is announced,
            // not that governance can set nonsense.
            uint256 portfolioBps = _bounded(valueSeed, 1_000, 5_000);
            uint256 cedantBps = _bounded(valueSeed >> 8, 5_000, 8_000);
            return (address(allocator), abi.encodeCall(allocator.setConcentrationLimits, (portfolioBps, cedantBps)));
        }
        uint256 window = _bounded(valueSeed, 1 hours, 7 days);
        return (address(claims), abi.encodeCall(claims.setDisputeWindow, (uint64(window))));
    }
}
