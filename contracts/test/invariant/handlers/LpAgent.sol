// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BaseAgent} from "./BaseAgent.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {MockUSDC} from "../../../src/MockUSDC.sol";

/// @title LpAgent — A11
/// @author Anton Carlo Santoro
/// @notice Institutional LPs. Holds no protocol role: every action is gated by
///         ComplianceRegistry alone, which is the point — an LP is not a
///         privileged actor, it is a whitelisted one.
/// @dev Archetypes are what make the population worth simulating. A pool of
///      identical depositors explores one path; a pool where one holder is
///      large enough to move the share price, another exits on the first
///      loss, and a third never exits, explores the paths that matter to
///      solvency. The archetype is derived from the actor index so it is
///      stable across a run and reproducible from the seed.
///
///      Every action is bounded by what the vault would actually permit, so
///      the run spends its budget on state transitions rather than on reverts.
///      The exception is deliberate: `depositUnwhitelisted` exists to prove
///      the compliance gate holds, and it is expected to fail.
contract LpAgent is BaseAgent {
    InsuranceVault internal immutable vault;
    MockUSDC internal immutable usdc;

    /// @notice Ghost: total deposited by this agent across the run.
    uint256 public ghostDeposited;
    /// @notice Ghost: total withdrawn by this agent across the run.
    uint256 public ghostWithdrawn;

    /// @notice Share price before the most recent deposit, for I-39.
    uint256 public lastSharePriceBeforeDeposit;
    /// @notice Share price after the most recent deposit, for I-39.
    uint256 public lastSharePriceAfterDeposit;
    /// @notice True once at least one deposit has been observed.
    bool public sawDeposit;

    /// @notice Actor known to be outside the whitelist, for the negative path.
    address public immutable outsider;

    enum Archetype {
        HOLD, // never redeems
        RECURRING, // deposits and redeems in turn
        PANIC, // exits fully at the first opportunity
        WHALE // large tickets
    }

    constructor(InsuranceVault vault_, MockUSDC usdc_, address[] memory lps, address outsider_) {
        vault = vault_;
        usdc = usdc_;
        outsider = outsider_;
        for (uint256 i; i < lps.length; ++i) {
            actors.push(lps[i]);
        }
        _track(this.deposit.selector);
        _track(this.redeemShares.selector);
        _track(this.depositUnwhitelisted.selector);
    }

    /// @notice Archetype of an actor, stable for the whole run.
    function archetypeOf(uint256 index) public pure returns (Archetype) {
        return Archetype(index % 4);
    }

    /// @notice Deposit USDC and mint shares.
    function deposit(uint256 actorSeed, uint256 amount) external {
        uint256 idx = actorSeed % actors.length;
        address lp = actors[idx];
        Archetype kind = archetypeOf(idx);

        uint256 cap = vault.maxDeposit(lp);
        if (cap == 0) {
            _record(this.deposit.selector, false);
            return;
        }

        // A whale writes a ticket large enough to matter to the share price;
        // everyone else stays small. Both are bounded by what the vault will
        // accept, so neither wastes the run on a certain revert.
        uint256 hi = kind == Archetype.WHALE ? cap : (cap < 50_000e6 ? cap : 50_000e6);
        amount = _bounded(amount, 1e6, hi == 0 ? 1e6 : hi);
        if (amount > cap) amount = cap;

        usdc.mint(lp, amount);

        // Recorded around the deposit so the invariant can compare like with
        // like: a single deposit must not reduce the value of a share already
        // held. Anything else in the run may legitimately move it.
        lastSharePriceBeforeDeposit = vault.convertToAssets(1e18);

        vm.startPrank(lp);
        usdc.approve(address(vault), amount);
        try vault.deposit(amount, lp) {
            ghostDeposited += amount;
            _record(this.deposit.selector, true);
        } catch {
            _record(this.deposit.selector, false);
        }
        vm.stopPrank();

        lastSharePriceAfterDeposit = vault.convertToAssets(1e18);
        sawDeposit = true;
    }

    /// @notice Redeem shares for USDC, within the free buffer.
    function redeemShares(uint256 actorSeed, uint256 shareSeed) external {
        uint256 idx = actorSeed % actors.length;
        address lp = actors[idx];
        Archetype kind = archetypeOf(idx);

        // A holder that never sells is a real position in the book, and its
        // absence from the redemption path is itself part of the state.
        if (kind == Archetype.HOLD) return;

        uint256 redeemable = vault.maxRedeem(lp);
        if (redeemable == 0) {
            _record(this.redeemShares.selector, false);
            return;
        }

        uint256 shares = kind == Archetype.PANIC ? redeemable : _bounded(shareSeed, 1, redeemable);

        vm.prank(lp);
        try vault.redeem(shares, lp, lp) returns (uint256 assets) {
            ghostWithdrawn += assets;
            _record(this.redeemShares.selector, true);
        } catch {
            _record(this.redeemShares.selector, false);
        }
    }

    /// @notice Negative perimeter: a non-whitelisted address must never receive
    ///         shares. Expected to fail on every call.
    /// @dev Counted like any other selector, so a run where the compliance gate
    ///      silently stopped being exercised is visible in the summary rather
    ///      than passing quietly.
    function depositUnwhitelisted(uint256 amount) external {
        amount = _bounded(amount, 1e6, 10_000e6);
        usdc.mint(outsider, amount);

        vm.startPrank(outsider);
        usdc.approve(address(vault), amount);
        try vault.deposit(amount, outsider) {
            // Reaching here is a P0 finding: the gate did not hold.
            _record(this.depositUnwhitelisted.selector, true);
        } catch {
            _record(this.depositUnwhitelisted.selector, false);
        }
        vm.stopPrank();
    }

    /// @notice True when a non-whitelisted deposit ever succeeded.
    /// @dev `calls - reverts` is the count of successes, and for this selector
    ///      any success at all is the failure.
    function complianceGateBreached() external view returns (bool) {
        bytes4 sel = this.depositUnwhitelisted.selector;
        return calls[sel] > reverts[sel];
    }
}
