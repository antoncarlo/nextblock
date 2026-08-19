// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseAgent} from "./BaseAgent.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";

/// @title SentinelAgent — A4
/// @author Anton Carlo Santoro
/// @notice The risk guardian: freezes, disputes, pauses. Its defining
///         constraint is negative — it may reduce risk and must never move
///         funds.
/// @dev Two behaviours, both necessary. Reactive freezes respond to state;
///      random ones exist to prove a spurious pause is always reversible. A
///      guardian that can halt something without a way back is a guardian that
///      can trap capital, and that is worse than the risk it was pausing.
///
///      The agent also attempts to move USDC. That call must always fail: the
///      sentinel holds SENTINEL_ROLE and no transfer authority. The
///      orchestrator asserts the balance is constant across the run, which is
///      the same claim stated where it cannot be self-certified.
contract SentinelAgent is BaseAgent {
    ClaimManager internal immutable claims;
    IERC20 internal immutable usdc;

    /// @notice USDC balance of the sentinel key at construction, for I-30.
    uint256 public immutable openingBalance;

    /// @notice Ghost: freezes applied.
    uint256 public ghostFrozen;
    /// @notice Ghost: freezes lifted.
    uint256 public ghostUnfrozen;
    /// @notice True if the sentinel ever succeeded in moving USDC (P0).
    bool public movedFunds;

    constructor(ClaimManager claims_, IERC20 usdc_, address sentinelKey) {
        claims = claims_;
        usdc = usdc_;
        actors.push(sentinelKey);
        openingBalance = usdc_.balanceOf(sentinelKey);
        _track(this.freezeSuspect.selector);
        _track(this.unfreeze.selector);
        _track(this.disputeSuspect.selector);
        _track(this.attemptFundMove.selector);
    }

    /// @notice Freeze a claim — the operational anomaly latch.
    function freezeSuspect(uint256 claimSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.freezeSuspect.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);

        vm.prank(actors[0]);
        try claims.freezeClaim(id) {
            ghostFrozen += 1;
            _record(this.freezeSuspect.selector, true);
        } catch {
            _record(this.freezeSuspect.selector, false);
        }
    }

    /// @notice Lift a freeze. Reversibility is the property being proved.
    function unfreeze(uint256 claimSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.unfreeze.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);

        vm.prank(actors[0]);
        try claims.unfreezeClaim(id) {
            ghostUnfrozen += 1;
            _record(this.unfreeze.selector, true);
        } catch {
            _record(this.unfreeze.selector, false);
        }
    }

    /// @notice Dispute a claim, handing it to the committee.
    function disputeSuspect(uint256 claimSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.disputeSuspect.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);

        vm.prank(actors[0]);
        try claims.disputeClaim(id, "simulation: sentinel dispute") {
            _record(this.disputeSuspect.selector, true);
        } catch {
            _record(this.disputeSuspect.selector, false);
        }
    }

    /// @notice Negative perimeter: try to move USDC. Must always fail.
    /// @dev The sentinel holds no balance, so the transfer reverts on funds
    ///      rather than on authority — which is the honest situation and still
    ///      the property worth asserting: after the whole run its balance is
    ///      unchanged, whatever it attempted.
    function attemptFundMove(uint256 amountSeed) external {
        uint256 amount = _bounded(amountSeed, 1, 1_000e6);
        address sentinel = actors[0];

        vm.prank(sentinel);
        try usdc.transfer(address(0xdead), amount) returns (bool ok) {
            if (ok) movedFunds = true;
            _record(this.attemptFundMove.selector, ok);
        } catch {
            _record(this.attemptFundMove.selector, false);
        }
    }

    /// @notice Freezes that were never lifted, for the reversibility invariant.
    function outstandingFreezes() external view returns (uint256) {
        return ghostFrozen > ghostUnfrozen ? ghostFrozen - ghostUnfrozen : 0;
    }
}
