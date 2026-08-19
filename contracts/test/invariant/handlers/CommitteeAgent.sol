// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";

/// @title CommitteeAgent — A5
/// @author Anton Carlo Santoro
/// @notice The claims committee: approves, rejects, resolves disputes. It
///         cannot pay — payment is `executeClaim`, permissionless by design.
/// @dev Partial approval is the case worth exercising. A committee that always
///      approves the full requested amount never tests the arithmetic that
///      separates requested, approved and paid, and that arithmetic is where an
///      overpayment would hide. So approvals are sampled across the whole
///      range, and one call in five aims deliberately above the request to
///      prove the ceiling holds.
///
///      Frozen claims are attempted too. A freeze that can be approved through
///      is a freeze that does nothing, and the sentinel's authority would be
///      decorative.
contract CommitteeAgent is BaseAgent {
    ClaimManager internal immutable claims;
    InsuranceVault internal immutable vault;
    PortfolioRegistry internal immutable portfolios;

    /// @notice Ghost: total approved across the run.
    uint256 public ghostApproved;
    /// @notice Ghost: claims rejected across the run.
    uint256 public ghostRejected;
    /// @notice True if an approval ever exceeded the requested amount (P0).
    bool public overApprovalAccepted;
    /// @notice True if a frozen claim was ever approved (P0).
    bool public frozenClaimApproved;

    constructor(ClaimManager claims_, InsuranceVault vault_, PortfolioRegistry portfolios_, address committeeKey) {
        claims = claims_;
        vault = vault_;
        portfolios = portfolios_;
        actors.push(committeeKey);
        _track(this.approveWithin.selector);
        _track(this.approveOverRequested.selector);
        _track(this.rejectPending.selector);
    }

    /// @notice Approve a pending claim for a sampled fraction of the request.
    function approveWithin(uint256 claimSeed, uint256 amountSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.approveWithin.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);
        ClaimManager.Claim memory c = claims.getClaim(id);
        if (c.requestedAmount == 0) {
            _record(this.approveWithin.selector, false);
            return;
        }

        bool wasFrozen = c.frozen;
        uint256 amount = _bounded(amountSeed, 1, c.requestedAmount);

        vm.prank(actors[0]);
        try claims.approveClaim(id, amount) {
            // A frozen claim reaching approval is a P0: the freeze did nothing.
            if (wasFrozen) frozenClaimApproved = true;
            ghostApproved += amount;
            _record(this.approveWithin.selector, true);
        } catch {
            _record(this.approveWithin.selector, false);
        }
    }

    /// @notice Negative perimeter: approve above the requested amount.
    function approveOverRequested(uint256 claimSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.approveOverRequested.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);
        ClaimManager.Claim memory c = claims.getClaim(id);
        if (c.requestedAmount == 0) {
            _record(this.approveOverRequested.selector, false);
            return;
        }

        // One unit over: the smallest amount that must be refused.
        vm.prank(actors[0]);
        try claims.approveClaim(id, c.requestedAmount + 1) {
            overApprovalAccepted = true;
            _record(this.approveOverRequested.selector, true);
        } catch {
            _record(this.approveOverRequested.selector, false);
        }
    }

    /// @notice Reject a claim, exercising the terminal path.
    function rejectPending(uint256 claimSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) {
            _record(this.rejectPending.selector, false);
            return;
        }
        uint256 id = _bounded(claimSeed, 1, total);

        vm.prank(actors[0]);
        try claims.rejectClaim(id, "simulation: rejected by committee") {
            ghostRejected += 1;
            _record(this.rejectPending.selector, true);
        } catch {
            _record(this.rejectPending.selector, false);
        }
    }
}
