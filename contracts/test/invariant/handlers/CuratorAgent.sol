// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";
import {NavOracle} from "../../../src/NavOracle.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {VaultAllocator} from "../../../src/VaultAllocator.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";

/// @title CuratorAgent — A2
/// @author Anton Carlo Santoro
/// @notice The Underwriting Curator: reads risk, decides, and moves books
///         through the state machine.
///
/// @dev The curator is the role with the most discretion in the protocol and
///      therefore the one whose limits are worth stating precisely. It decides
///      what the vault takes on — and it must not be able to decide where the
///      capital goes, whether a claim is paid, or whether trading stops. Those
///      are the allocator's, the committee's and the sentinel's levers, and a
///      curator that could reach any of them would hold the whole protocol.
///
///      Decisions follow the risk score A9 publishes, with one in ten taken
///      deliberately against it. A curator that always agrees with the model is
///      not a curator; it is the model with extra steps, and the branches that
///      handle a contrarian call would never execute.
contract CuratorAgent is BaseAgent {
    PortfolioRegistry internal immutable portfolios;
    NavOracle internal immutable nav;
    InsuranceVault internal immutable vault;
    VaultAllocator internal immutable allocator;
    ClaimManager internal immutable claims;

    /// @notice Ghost: books moved out of review, either way.
    uint256 public ghostDecisions;
    /// @notice Ghost: books put on risk.
    uint256 public ghostActivations;
    /// @notice True if the curator ever allocated capital.
    bool public curatorAllocatedCapital;
    /// @notice True if the curator ever approved a claim.
    bool public curatorApprovedClaim;
    /// @notice True if the curator ever pulled a sentinel lever.
    bool public curatorPausedRisk;
    /// @notice True if a book reached ACTIVE without passing through review.
    bool public activatedWithoutReview;

    /// @notice Risk score above which a book is normally declined.
    uint16 internal constant DECLINE_ABOVE_BPS = 6_000;

    uint256 private salt = 1;

    constructor(
        PortfolioRegistry portfolios_,
        NavOracle nav_,
        InsuranceVault vault_,
        VaultAllocator allocator_,
        ClaimManager claims_,
        address curatorKey
    ) {
        portfolios = portfolios_;
        nav = nav_;
        vault = vault_;
        allocator = allocator_;
        claims = claims_;
        actors.push(curatorKey);
        _track(this.reviewNext.selector);
        _track(this.decideNext.selector);
        _track(this.activateApproved.selector);
        _track(this.activateWithoutReview.selector);
        _track(this.reachBeyondUnderwriting.selector);
    }

    /// @notice Take the next submitted book into review.
    function reviewNext(uint256 seed) external {
        uint256 pid = _findByStatus(PortfolioRegistry.PortfolioStatus.SUBMITTED, seed);
        if (pid == type(uint256).max) return;

        vm.prank(actors[0]);
        try portfolios.startReview(pid) {
            _record(this.reviewNext.selector, true);
        } catch {
            _record(this.reviewNext.selector, false);
        }
    }

    /// @notice Approve or decline a book under review, reading the risk feed.
    function decideNext(uint256 seed, uint256 lossSeed) external {
        uint256 pid = _findByStatus(PortfolioRegistry.PortfolioStatus.UNDER_REVIEW, seed);
        if (pid == type(uint256).max) return;

        bool decline = _riskSaysDecline(pid);
        // One call in ten goes against the model, in whichever direction the
        // model pointed. `_chance` reads basis points, so a tenth is 1,000.
        if (_chance(seed, 1_000)) decline = !decline;

        vm.prank(actors[0]);
        if (decline) {
            try portfolios.rejectPortfolio(pid, "risk outside appetite") {
                ghostDecisions += 1;
                _record(this.decideNext.selector, true);
            } catch {
                _record(this.decideNext.selector, false);
            }
        } else {
            uint16 expectedLoss = uint16(_bounded(lossSeed, 50, 3_000));
            try portfolios.approvePortfolio(pid, expectedLoss) {
                ghostDecisions += 1;
                _record(this.decideNext.selector, true);
            } catch {
                _record(this.decideNext.selector, false);
            }
        }
    }

    /// @notice Put an approved book on risk.
    function activateApproved(uint256 seed) external {
        uint256 pid = _findByStatus(PortfolioRegistry.PortfolioStatus.APPROVED, seed);
        if (pid == type(uint256).max) return;

        vm.prank(actors[0]);
        try portfolios.activatePortfolio(pid) {
            ghostActivations += 1;
            _record(this.activateApproved.selector, true);
        } catch {
            _record(this.activateApproved.selector, false);
        }
    }

    /// @notice Negative perimeter: put a book on risk without reviewing it.
    /// @dev A book that reaches ACTIVE straight from SUBMITTED has been
    ///      underwritten by nobody, and the vault is on risk for terms no one
    ///      read.
    function activateWithoutReview(uint256 seed) external {
        uint256 pid = _findByStatus(PortfolioRegistry.PortfolioStatus.SUBMITTED, seed);
        if (pid == type(uint256).max) return;

        vm.prank(actors[0]);
        try portfolios.activatePortfolio(pid) {
            activatedWithoutReview = true;
            _record(this.activateWithoutReview.selector, true);
        } catch {
            _record(this.activateWithoutReview.selector, false);
        }
    }

    /// @notice Negative perimeter: the curator reaches for the other roles' levers.
    /// @dev Deciding what the book contains and deciding where the money goes
    ///      are separate powers on purpose. Held together they would let one key
    ///      approve a book and then fund it without anyone else in the loop.
    function reachBeyondUnderwriting(uint256 seed, uint256 amountSeed) external {
        address key = actors[0];
        uint256 amount = _bounded(amountSeed, 1e6, 500_000e6);
        uint256 pid = _findByStatus(PortfolioRegistry.PortfolioStatus.ACTIVE, seed);
        uint256 claimId = _bounded(seed, 0, 20);

        vm.startPrank(key);
        if (pid != type(uint256).max) {
            try allocator.proposeAllocation(address(vault), pid, amount) {
                curatorAllocatedCapital = true;
            } catch {}
            try portfolios.pausePortfolio(pid) {
                curatorPausedRisk = true;
            } catch {}
        }
        try claims.approveClaim(claimId, amount) {
            curatorApprovedClaim = true;
        } catch {}
        try claims.freezeClaim(claimId) {
            curatorPausedRisk = true;
        } catch {}
        vm.stopPrank();

        _record(this.reachBeyondUnderwriting.selector, true);
    }

    /// @dev Scans from a seeded offset rather than always from zero, so the
    ///      books late in the list are reached as often as the early ones.
    ///      Returns `type(uint256).max` when nothing matches.
    function _findByStatus(PortfolioRegistry.PortfolioStatus wanted, uint256 seed) internal view returns (uint256) {
        uint256 total = portfolios.nextPortfolioId();
        if (total == 0) return type(uint256).max;

        uint256 start = seed % total;
        for (uint256 i; i < total; ++i) {
            uint256 pid = (start + i) % total;
            if (portfolios.getPortfolio(pid).status == wanted) return pid;
        }
        return type(uint256).max;
    }

    /// @dev No attestation means no basis to decline: an absent feed is not a
    ///      bad score, and treating it as one would decline every book on a
    ///      quiet oracle.
    function _riskSaysDecline(uint256 pid) internal view returns (bool) {
        // The strict getter reverts when the score was never published or has
        // gone stale, and that is exactly the reading wanted here: no current
        // attestation is no basis to decline.
        try nav.getPortfolioRisk(pid) returns (uint16 score, uint16, uint64) {
            return score > DECLINE_ABOVE_BPS;
        } catch {
            return false;
        }
    }
}
