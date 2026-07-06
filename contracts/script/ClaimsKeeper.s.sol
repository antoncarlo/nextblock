// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ClaimManager} from "../src/ClaimManager.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";

/// @title ClaimsKeeper
/// @author Anton Carlo Santoro
/// @notice Finalization keeper for the claims/bordereau lifecycle. Sweeps two
///         permissionless queues so approved decisions settle without waiting
///         for a human to push the last button:
///           1. `ClaimManager.executeClaim` — committee-APPROVED, unfrozen
///              claims are paid out from the vault reserve (CEI-guarded).
///           2. `BordereauOracle.finalizeAssertion` — PROPOSED assertions
///              whose liveness window elapsed undisputed become FINALIZED.
///         All authority checks already happened on-chain (committee approval,
///         liveness); the keeper only supplies gas. Idempotent and no-op-safe
///         on a schedule; MAX_ACTIONS bounds broadcasts per run.
///
///         Reads CLAIM_MANAGER_ADDRESS / BORDEREAU_ORACLE_ADDRESS. The keyed
///         caller needs no role — both entrypoints are permissionless.
contract ClaimsKeeper is Script {
    /// @notice Upper bound of broadcasts per run: a cron caller never sends an
    ///         unbounded transaction batch, whatever the backlog size.
    uint256 public constant MAX_ACTIONS = 20;

    function run() external {
        address claimManagerAddr = vm.envAddress("CLAIM_MANAGER_ADDRESS");
        address bordereauAddr = vm.envAddress("BORDEREAU_ORACLE_ADDRESS");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        (uint256 executedClaims, uint256 finalizedAssertions) = sweep(claimManagerAddr, bordereauAddr, pk, MAX_ACTIONS);
        console2.log("ClaimsKeeper: claims executed:", executedClaims);
        console2.log("ClaimsKeeper: assertions finalized:", finalizedAssertions);
    }

    /// @notice Execute every due claim payout and assertion finalization,
    ///         bounded by `maxActions` broadcasts.
    /// @dev Parameterized (no env) so unit tests drive it deterministically.
    ///      Full scan from id 0: fine at staging scale; a production keeper
    ///      would persist a cursor past terminal-status prefixes.
    function sweep(address claimManagerAddr, address bordereauAddr, uint256 pk, uint256 maxActions)
        public
        returns (uint256 executedClaims, uint256 finalizedAssertions)
    {
        ClaimManager claimManager = ClaimManager(claimManagerAddr);
        uint256 claimCount = claimManager.getClaimCount();
        for (uint256 id = 0; id < claimCount; id++) {
            if (executedClaims + finalizedAssertions >= maxActions) return (executedClaims, finalizedAssertions);
            ClaimManager.Claim memory c = claimManager.getClaim(id);
            // Mirror executeClaim's own preconditions so a sweep never reverts.
            if (c.status != ClaimManager.ClaimStatus.APPROVED || c.frozen) continue;
            vm.broadcast(pk);
            claimManager.executeClaim(id);
            executedClaims++;
        }

        BordereauOracle bordereau = BordereauOracle(bordereauAddr);
        uint256 assertionCount = bordereau.getAssertionCount();
        for (uint256 id = 0; id < assertionCount; id++) {
            if (executedClaims + finalizedAssertions >= maxActions) return (executedClaims, finalizedAssertions);
            BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
            // Mirror finalizeAssertion's preconditions (still PROPOSED, liveness elapsed).
            if (a.status != BordereauOracle.AssertionStatus.PROPOSED) continue;
            if (uint64(block.timestamp) <= a.livenessDeadline) continue;
            vm.broadcast(pk);
            bordereau.finalizeAssertion(id);
            finalizedAssertions++;
        }
    }
}
