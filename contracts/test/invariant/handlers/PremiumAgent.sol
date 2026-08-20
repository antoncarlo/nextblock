// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {MockUSDC} from "../../../src/MockUSDC.sol";

/// @title PremiumAgent — A7
/// @author Anton Carlo Santoro
/// @notice The party that pays premiums in, at irregular intervals and in
///         irregular amounts, the way a real cedant's treasury does.
///
/// @dev This is the agent that makes the vault's numbers move. Premium arrives,
///      is booked as unearned, and is recognised as yield only across the
///      coverage period — so the share price rises gradually rather than
///      jumping on receipt. Without this agent the suite exercises a vault whose
///      assets never change, and every accounting invariant is asserted against
///      a flat line.
///
///      Amounts vary by two orders of magnitude and payments do not follow the
///      allocation, because a treasury that always pays the expected figure on
///      the expected day never tests the arithmetic that handles the one that
///      does not.
contract PremiumAgent is BaseAgent {
    InsuranceVault internal immutable vault;
    MockUSDC internal immutable usdc;

    /// @notice Policy ids known to be inside the vault.
    uint256[] internal fundablePolicies;

    /// @notice Ghost: total premium this agent has successfully paid in.
    uint256 public ghostPremiumPaid;
    /// @notice True if a premium landed on a policy the vault does not hold.
    bool public paidIntoUnknownPolicy;
    /// @notice True if the depositor ever moved assets out of the vault.
    bool public depositorWithdrewAssets;

    constructor(InsuranceVault vault_, MockUSDC usdc_, address depositor, uint256[] memory policies_) {
        vault = vault_;
        usdc = usdc_;
        actors.push(depositor);
        for (uint256 i; i < policies_.length; ++i) {
            fundablePolicies.push(policies_[i]);
        }
        _track(this.payPremium.selector);
        _track(this.payIntoUnknownPolicy.selector);
        _track(this.attemptWithdrawal.selector);
    }

    /// @notice Pay a premium instalment on a policy the vault holds.
    function payPremium(uint256 policySeed, uint256 amountSeed) external {
        if (fundablePolicies.length == 0) return;
        uint256 policyId = fundablePolicies[policySeed % fundablePolicies.length];

        // 1,000 to 100,000 USDC: wide enough that rounding behaves differently
        // at the ends, narrow enough that every payment is plausible.
        uint256 amount = _bounded(amountSeed, 1_000e6, 100_000e6);

        address payer = actors[0];
        usdc.mint(payer, amount);

        vm.startPrank(payer);
        usdc.approve(address(vault), amount);
        try vault.depositPremium(policyId, amount) {
            ghostPremiumPaid += amount;
            _record(this.payPremium.selector, true);
        } catch {
            _record(this.payPremium.selector, false);
        }
        vm.stopPrank();
    }

    /// @notice Negative perimeter: pay into a policy the vault never took on.
    /// @dev Premium credited against a policy the vault does not back would
    ///      inflate the share price for work the vault is not doing.
    function payIntoUnknownPolicy(uint256 idSeed, uint256 amountSeed) external {
        // Far above any id the suite registers, so this can only ever name a
        // policy the vault does not hold.
        uint256 policyId = _bounded(idSeed, 1_000_000, 2_000_000);
        uint256 amount = _bounded(amountSeed, 1e6, 10_000e6);

        address payer = actors[0];
        usdc.mint(payer, amount);

        vm.startPrank(payer);
        usdc.approve(address(vault), amount);
        try vault.depositPremium(policyId, amount) {
            paidIntoUnknownPolicy = true;
            _record(this.payIntoUnknownPolicy.selector, true);
        } catch {
            _record(this.payIntoUnknownPolicy.selector, false);
        }
        vm.stopPrank();
    }

    /// @notice Negative perimeter: paying in must not confer the right to take out.
    /// @dev The depositor role touches the vault's balance on every call, which
    ///      is exactly why it is worth asserting that the traffic runs one way.
    function attemptWithdrawal(uint256 amountSeed) external {
        address payer = actors[0];
        uint256 amount = _bounded(amountSeed, 1e6, 50_000e6);
        uint256 before = usdc.balanceOf(payer);

        vm.startPrank(payer);
        try vault.withdraw(amount, payer, payer) {
            if (usdc.balanceOf(payer) > before) depositorWithdrewAssets = true;
            _record(this.attemptWithdrawal.selector, true);
        } catch {
            _record(this.attemptWithdrawal.selector, false);
        }
        vm.stopPrank();
    }

    /// @notice Policies this agent can fund, for the orchestrator's assertions.
    function fundable() external view returns (uint256[] memory) {
        return fundablePolicies;
    }
}
