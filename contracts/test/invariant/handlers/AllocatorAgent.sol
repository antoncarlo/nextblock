// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {VaultAllocator} from "../../../src/VaultAllocator.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";

/// @title AllocatorAgent — A3
/// @author Anton Carlo Santoro
/// @notice Distributes capacity across portfolios within approved limits, and
///         must fail at everything else.
/// @dev The agent deliberately works both sides of each limit. Staying always
///      inside them would leave the guards untested — a concentration cap that
///      is never approached is a cap nobody has proved. So `allocateWithin`
///      exercises the permitted path, and `allocateOverConcentration` aims
///      past the ceiling and expects the revert.
///
///      The allocator holds ALLOCATOR_ROLE and nothing else. It cannot pause,
///      cannot approve a claim, and must never custody funds; those are
///      asserted by the orchestrator's invariants rather than here, because an
///      agent asserting its own good behaviour proves nothing.
contract AllocatorAgent is BaseAgent {
    InsuranceVault internal immutable vault;
    VaultAllocator internal immutable allocatorC;
    PortfolioRegistry internal immutable portfolios;

    uint256[] internal portfolioIds;

    /// @notice Ghost: allocations that succeeded.
    uint256 public ghostAllocated;
    /// @notice Ghost: deallocations that succeeded.
    uint256 public ghostDeallocated;
    /// @notice True if an over-concentration allocation ever succeeded (P0).
    bool public concentrationBreached;
    /// @notice Amount allocated while the oracle guard was open, for I-29.
    /// @dev Kept beside ghostAllocated so the invariant can ask a precise
    ///      question: did anything get through while the gate was shut? With a
    ///      single counter the two cases are indistinguishable after the fact.
    uint256 public allocatedWhileOracleWasUsable;

    constructor(
        InsuranceVault vault_,
        VaultAllocator allocator_,
        PortfolioRegistry portfolios_,
        address allocatorKey,
        uint256[] memory pids
    ) {
        vault = vault_;
        allocatorC = allocator_;
        portfolios = portfolios_;
        actors.push(allocatorKey);
        for (uint256 i; i < pids.length; ++i) {
            portfolioIds.push(pids[i]);
        }
        _track(this.allocateWithin.selector);
        _track(this.deallocate.selector);
        _track(this.allocateOverConcentration.selector);
    }

    /// @notice Allocate an amount that every limit permits.
    function allocateWithin(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 room = _room(pid);
        if (room == 0) {
            _record(this.allocateWithin.selector, false);
            return;
        }
        amount = _bounded(amount, 1, room);

        address key = actors[0];
        vm.prank(key);
        try allocatorC.proposeAllocation(address(vault), pid, amount) returns (uint256 propId) {
            vm.prank(key);
            try allocatorC.executeAllocation(propId) {
                ghostAllocated += amount;
                allocatedWhileOracleWasUsable += amount;
                _record(this.allocateWithin.selector, true);
            } catch {
                _record(this.allocateWithin.selector, false);
            }
        } catch {
            _record(this.allocateWithin.selector, false);
        }
    }

    /// @notice Return capacity to the vault.
    function deallocate(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 allocated = vault.portfolioAllocation(pid);
        if (allocated == 0) {
            _record(this.deallocate.selector, false);
            return;
        }
        amount = _bounded(amount, 1, allocated);

        address key = actors[0];
        vm.prank(key);
        try allocatorC.proposeDeallocation(address(vault), pid, amount) returns (uint256 propId) {
            vm.prank(key);
            try allocatorC.executeAllocation(propId) {
                ghostDeallocated += amount;
                _record(this.deallocate.selector, true);
            } catch {
                _record(this.deallocate.selector, false);
            }
        } catch {
            _record(this.deallocate.selector, false);
        }
    }

    /// @notice Negative perimeter: aim past the per-portfolio ceiling.
    /// @dev A cap that is never approached is a cap nobody has proved. If this
    ///      ever succeeds the run has found a real breach, recorded here and
    ///      asserted by the orchestrator.
    function allocateOverConcentration(uint256 pidSeed) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 base = allocatorC.investableBase(address(vault));
        if (base == 0) {
            _record(this.allocateOverConcentration.selector, false);
            return;
        }

        uint256 limit = base * allocatorC.maxPortfolioConcentrationBps() / 10_000;
        uint256 current = vault.portfolioAllocation(pid);
        // One unit past whatever remains under the cap — the smallest amount
        // that must be refused. Overshooting by a lot could revert for an
        // unrelated reason and prove nothing about the cap.
        uint256 over = limit >= current ? (limit - current) + 1 : 1;

        address key = actors[0];
        vm.prank(key);
        try allocatorC.proposeAllocation(address(vault), pid, over) returns (uint256 propId) {
            vm.prank(key);
            try allocatorC.executeAllocation(propId) {
                concentrationBreached = true;
                _record(this.allocateOverConcentration.selector, true);
            } catch {
                _record(this.allocateOverConcentration.selector, false);
            }
        } catch {
            _record(this.allocateOverConcentration.selector, false);
        }
    }

    /// @dev Largest amount satisfying vault capacity, both concentration caps
    ///      and the portfolio's ceded coverage. Mirrors the guards rather than
    ///      guessing at them, so the positive path stays inside every limit.
    function _room(uint256 pid) internal view returns (uint256 maxAlloc) {
        maxAlloc = vault.underwritingCapacity();
        if (maxAlloc == 0) return 0;

        uint256 base = allocatorC.investableBase(address(vault));
        uint256 current = vault.portfolioAllocation(pid);

        uint256 pLimit = base * allocatorC.maxPortfolioConcentrationBps() / 10_000;
        if (current >= pLimit) return 0;
        if (pLimit - current < maxAlloc) maxAlloc = pLimit - current;

        PortfolioRegistry.Portfolio memory pf = portfolios.getPortfolio(pid);
        uint256 coverageRoom = pf.coverageLimit > current ? pf.coverageLimit - current : 0;
        if (coverageRoom < maxAlloc) maxAlloc = coverageRoom;

        uint256 cLimit = base * allocatorC.maxCedantConcentrationBps() / 10_000;
        uint256 cExp = allocatorC.cedantExposure(address(vault), pf.cedant);
        if (cExp >= cLimit) return 0;
        if (cLimit - cExp < maxAlloc) maxAlloc = cLimit - cExp;
    }
}
