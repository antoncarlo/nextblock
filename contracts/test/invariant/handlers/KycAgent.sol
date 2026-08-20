// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {ComplianceRegistry} from "../../../src/ComplianceRegistry.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";

/// @title KycAgent — A8
/// @author Anton Carlo Santoro
/// @notice The KYC operator, exercising compliance against holders who already
///         have money in the vault.
/// @dev The specification names three cases as the densest source of bugs in an
///      ERC-3643-like system, and none of them was covered here: letting a KYC
///      date lapse while the investor holds shares, cutting an investor limit
///      below the position already taken, and revoking a whitelist entry on an
///      open position.
///
///      What makes them dangerous is not that they fail — it is that they can
///      succeed and leave capital stranded. An investor whose paperwork expired
///      is not an investor whose money may be kept, and a protocol that traps a
///      professional investor over an administrative lapse has a contractual
///      problem long before it has a technical one. So this agent creates those
///      states deliberately, and the orchestrator asserts the exit remains
///      open.
contract KycAgent is BaseAgent {
    ComplianceRegistry internal immutable compliance;
    InsuranceVault internal immutable vault;

    address[] internal lps;

    /// @notice Ghost: whitelist entries revoked while a position was open.
    uint256 public ghostRevokedWithPosition;
    /// @notice Ghost: KYC dates pushed into the past on a live holder.
    uint256 public ghostExpiredWithPosition;
    /// @notice True if the operator ever moved value (it must not be able to).
    bool public movedFunds;

    constructor(ComplianceRegistry compliance_, InsuranceVault vault_, address kycKey, address[] memory lps_) {
        compliance = compliance_;
        vault = vault_;
        actors.push(kycKey);
        for (uint256 i; i < lps_.length; ++i) {
            lps.push(lps_[i]);
        }
        _track(this.expireKycOnHolder.selector);
        _track(this.revokeWhitelistOnHolder.selector);
        _track(this.restoreCompliance.selector);
        _track(this.tightenInvestorLimit.selector);
    }

    /// @notice Let an investor's KYC lapse while they still hold shares.
    function expireKycOnHolder(uint256 lpSeed) external {
        address lp = lps[lpSeed % lps.length];
        bool holds = vault.balanceOf(lp) > 0;

        vm.prank(actors[0]);
        // One second into the past: expired by the smallest possible margin, so
        // the test is of the boundary rather than of an extreme.
        try compliance.setKycExpiry(lp, uint64(block.timestamp - 1)) {
            if (holds) ghostExpiredWithPosition += 1;
            _record(this.expireKycOnHolder.selector, true);
        } catch {
            _record(this.expireKycOnHolder.selector, false);
        }
    }

    /// @notice Revoke a whitelist entry on an open position.
    function revokeWhitelistOnHolder(uint256 lpSeed) external {
        address lp = lps[lpSeed % lps.length];
        bool holds = vault.balanceOf(lp) > 0;

        vm.prank(actors[0]);
        try compliance.setWhitelist(lp, false) {
            if (holds) ghostRevokedWithPosition += 1;
            _record(this.revokeWhitelistOnHolder.selector, true);
        } catch {
            _record(this.revokeWhitelistOnHolder.selector, false);
        }
    }

    /// @notice Put an investor back in good standing.
    /// @dev Without this the population drains to fully non-compliant within a
    ///      few hundred calls and the run stops exercising anything. Compliance
    ///      is a cycle in practice, and the simulation has to be one too.
    function restoreCompliance(uint256 lpSeed) external {
        address lp = lps[lpSeed % lps.length];

        vm.startPrank(actors[0]);
        bool ok = true;
        try compliance.setWhitelist(lp, true) {}
        catch {
            ok = false;
        }
        try compliance.setKycExpiry(lp, uint64(block.timestamp + 365 days)) {}
        catch {
            ok = false;
        }
        vm.stopPrank();

        _record(this.restoreCompliance.selector, ok);
    }

    /// @notice Cut an investor limit, possibly below the position already held.
    function tightenInvestorLimit(uint256 lpSeed, uint256 limitSeed) external {
        address lp = lps[lpSeed % lps.length];
        uint256 limit = _bounded(limitSeed, 0, 10_000e6);

        vm.prank(actors[0]);
        try compliance.setInvestorLimit(lp, limit) {
            _record(this.tightenInvestorLimit.selector, true);
        } catch {
            _record(this.tightenInvestorLimit.selector, false);
        }
    }

    /// @notice Holders this agent manages, for the orchestrator's assertions.
    function holders() external view returns (address[] memory) {
        return lps;
    }
}
