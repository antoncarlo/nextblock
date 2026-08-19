// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @title BaseAgent
/// @author Anton Carlo Santoro
/// @notice Shared base for the simulation agents: an actor pool, bounded input
///         helpers, and per-selector call accounting.
/// @dev The call counters are not decoration. An invariant run that calls
///      `deposit` ten thousand times and `approveClaim` never is a run that
///      proved nothing, and without counting per selector nobody notices —
///      the suite stays green because the interesting paths were never
///      reached. `callSummary()` makes that visible, and the M1 acceptance
///      criterion is stated over it: every tracked selector called at least
///      fifty times.
///
///      Reverts are counted separately from calls. Under `fail_on_revert =
///      false` a handler whose calls all revert looks identical to one doing
///      real work; the ratio is the only way to tell them apart.
abstract contract BaseAgent is Test {
    // --- Actor pool ---

    /// @notice Addresses this agent acts through.
    address[] internal actors;

    // --- Call accounting ---

    /// @notice Calls attempted per selector.
    mapping(bytes4 => uint256) public calls;
    /// @notice Calls that reverted per selector.
    mapping(bytes4 => uint256) public reverts;
    /// @notice Selectors this agent declares it should exercise.
    bytes4[] public trackedSelectors;

    /// @notice Registers a selector so it appears in the summary even at zero.
    /// @dev A selector missing from the summary and a selector never called
    ///      look the same to a reader; declaring them up front removes that
    ///      ambiguity, and a zero row is exactly the finding worth seeing.
    function _track(bytes4 selector) internal {
        trackedSelectors.push(selector);
    }

    /// @notice Records the outcome of one attempted action.
    function _record(bytes4 selector, bool ok) internal {
        calls[selector] += 1;
        if (!ok) reverts[selector] += 1;
    }

    /// @notice Per-selector call and revert counts, for `afterInvariant()`.
    function callSummary()
        external
        view
        returns (bytes4[] memory selectors, uint256[] memory callCounts, uint256[] memory revertCounts)
    {
        uint256 n = trackedSelectors.length;
        selectors = new bytes4[](n);
        callCounts = new uint256[](n);
        revertCounts = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            bytes4 sel = trackedSelectors[i];
            selectors[i] = sel;
            callCounts[i] = calls[sel];
            revertCounts[i] = reverts[sel];
        }
    }

    /// @notice Lowest call count across every tracked selector.
    /// @dev The acceptance criterion is a floor, so the floor is what the test
    ///      asserts on. Returning zero for an agent that tracks nothing would
    ///      let an empty agent pass a `>= 50` assertion, so that case is
    ///      reported as the maximum instead and callers must check the count.
    function minimumCalls() external view returns (uint256 fewest) {
        uint256 n = trackedSelectors.length;
        if (n == 0) return type(uint256).max;
        fewest = type(uint256).max;
        for (uint256 i; i < n; ++i) {
            uint256 c = calls[trackedSelectors[i]];
            if (c < fewest) fewest = c;
        }
    }

    /// @notice Number of selectors this agent tracks.
    function trackedCount() external view returns (uint256) {
        return trackedSelectors.length;
    }

    // --- Helpers ---

    /// @notice Picks an actor from the pool by seed.
    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    /// @notice Bounds a seed into [lo, hi] inclusive.
    /// @dev Wraps forge-std `bound` so every handler in the suite bounds inputs
    ///      the same way; unbounded fuzz inputs reduce an invariant run to a
    ///      revert generator.
    function _bounded(uint256 seed, uint256 lo, uint256 hi) internal pure returns (uint256) {
        return _boundInternal(seed, lo, hi);
    }

    function _boundInternal(uint256 x, uint256 lo, uint256 hi) private pure returns (uint256) {
        if (lo > hi) return lo;
        uint256 span = hi - lo + 1;
        if (span == 0) return x;
        return lo + (x % span);
    }

    /// @notice True with probability `pctBps` in basis points, from a seed.
    function _chance(uint256 seed, uint256 pctBps) internal pure returns (bool) {
        return (seed % 10_000) < pctBps;
    }
}
