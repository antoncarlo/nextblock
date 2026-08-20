// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";
import {VaultAllocator} from "../../../src/VaultAllocator.sol";
import {MockUSDC} from "../../../src/MockUSDC.sol";

/// @title KeeperAgent — A12
/// @author Anton Carlo Santoro
/// @notice The permissionless executor: settles whatever has matured, and
///         tries to settle what has not.
///
/// @dev The keeper holds no role, which is the point. Every function it calls
///      is open to anyone by design, so the protocol's safety cannot rest on
///      who calls them — only on what the call is allowed to do. That makes
///      this the agent whose negative perimeter matters most: an unprivileged
///      address is the one an attacker actually controls.
///
///      The question worth asking is not whether the keeper can execute a
///      claim — it is meant to — but whether executing one can ever pay
///      anybody other than the claimant on record. A keeper able to redirect a
///      payout turns a public utility function into a withdrawal.
///
///      The agent runs as several distinct unprivileged addresses rather than
///      one, so "the caller was the beneficiary" cannot be true by accident.
contract KeeperAgent is BaseAgent {
    ClaimManager internal immutable claims;
    PortfolioRegistry internal immutable portfolios;
    VaultAllocator internal immutable allocator;
    MockUSDC internal immutable usdc;

    /// @notice Ghost: claims settled by this agent.
    uint256 public ghostClaimsExecuted;
    /// @notice True if a keeper address ever gained USDC from executing.
    bool public keeperGainedValue;
    /// @notice True if a payout ever reached an address other than the claimant.
    bool public payoutWentToWrongParty;
    /// @notice True if a claim was settled while still frozen.
    bool public frozenClaimExecuted;

    constructor(
        ClaimManager claims_,
        PortfolioRegistry portfolios_,
        VaultAllocator allocator_,
        MockUSDC usdc_,
        address[] memory keepers
    ) {
        claims = claims_;
        portfolios = portfolios_;
        allocator = allocator_;
        usdc = usdc_;
        for (uint256 i; i < keepers.length; ++i) {
            actors.push(keepers[i]);
        }
        _track(this.settleClaim.selector);
        _track(this.settleEverythingInRange.selector);
        _track(this.expireMaturedPortfolio.selector);
        _track(this.expireMaturedProposal.selector);
    }

    /// @notice Settle one claim, from an unprivileged address.
    /// @dev Balances are read on both sides of the call: the claimant's, which
    ///      must be the only one that rises, and the caller's, which must not.
    ///      Asserting on the transfer rather than on the call's success is the
    ///      difference between testing that it worked and testing who got paid.
    function settleClaim(uint256 idSeed, uint256 actorSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) return;
        uint256 claimId = idSeed % total;

        ClaimManager.Claim memory c = claims.getClaim(claimId);
        address keeper = actors[actorSeed % actors.length];
        bool wasFrozen = c.frozen;

        uint256 keeperBefore = usdc.balanceOf(keeper);
        uint256 claimantBefore = usdc.balanceOf(c.claimant);

        vm.prank(keeper);
        try claims.executeClaim(claimId) {
            ghostClaimsExecuted += 1;
            if (wasFrozen) frozenClaimExecuted = true;

            // The caller must be no richer for having called. Skipped when the
            // keeper happens to be the claimant, which cannot occur with the
            // addresses this suite uses but would make the check meaningless.
            if (keeper != c.claimant && usdc.balanceOf(keeper) > keeperBefore) {
                keeperGainedValue = true;
            }
            // Something was paid, and it did not reach the claimant.
            if (c.approvedAmount > 0 && usdc.balanceOf(c.claimant) == claimantBefore) {
                payoutWentToWrongParty = true;
            }
            _record(this.settleClaim.selector, true);
        } catch {
            _record(this.settleClaim.selector, false);
        }
    }

    /// @notice Sweep a range of ids, settling whatever will go.
    /// @dev A keeper in production does not pick one id; it walks the book. The
    ///      sweep also reaches claims the seeded single-shot call would rarely
    ///      land on.
    function settleEverythingInRange(uint256 actorSeed) external {
        uint256 total = claims.getClaimCount();
        if (total == 0) return;
        address keeper = actors[actorSeed % actors.length];
        uint256 keeperBefore = usdc.balanceOf(keeper);

        uint256 span = total > 12 ? 12 : total;
        for (uint256 i; i < span; ++i) {
            vm.prank(keeper);
            try claims.executeClaim(i) {
                ghostClaimsExecuted += 1;
            } catch {}
        }

        if (usdc.balanceOf(keeper) > keeperBefore) keeperGainedValue = true;
        _record(this.settleEverythingInRange.selector, true);
    }

    /// @notice Retire a book whose cover period has run out.
    function expireMaturedPortfolio(uint256 pidSeed, uint256 actorSeed) external {
        uint256 total = portfolios.nextPortfolioId();
        if (total == 0) return;
        uint256 pid = pidSeed % total;

        vm.prank(actors[actorSeed % actors.length]);
        try portfolios.markExpired(pid) {
            _record(this.expireMaturedPortfolio.selector, true);
        } catch {
            _record(this.expireMaturedPortfolio.selector, false);
        }
    }

    /// @notice Retire an allocation proposal that outlived its window.
    /// @dev Attempted on every id in range, matured or not. A proposal that can
    ///      be retired early is a proposal that can be cancelled by a stranger.
    function expireMaturedProposal(uint256 idSeed, uint256 actorSeed) external {
        uint256 proposalId = _bounded(idSeed, 0, 30);

        vm.prank(actors[actorSeed % actors.length]);
        try allocator.markExpired(proposalId) {
            _record(this.expireMaturedProposal.selector, true);
        } catch {
            _record(this.expireMaturedProposal.selector, false);
        }
    }

    /// @notice The unprivileged addresses this agent runs as.
    function keeperAddresses() external view returns (address[] memory) {
        return actors;
    }
}
