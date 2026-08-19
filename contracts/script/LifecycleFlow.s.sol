// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title LifecycleFlow
/// @author Anton Carlo Santoro
/// @notice Takes a policy through its whole life on an EXISTING deployment, so
///         the platform's own figures move: premium received, earned over time,
///         management fee accrued, policy expired, LP redeeming against a
///         readable return.
///
/// @dev Why this exists. `DemoFlow` deploys a fresh stack and exercises every
///      module once; useful as a smoke test, useless for watching numbers move,
///      because a premium received one second ago is entirely unearned and the
///      NAV has not budged. What makes a vault look alive is time passing, and
///      on staging time passes through `PolicyRegistry.advanceTime`.
///
///      This script therefore binds to the deployed addresses rather than
///      creating new ones, and its centre is the clock. It prints the vault's
///      state at each stage so the progression is legible without a subgraph.
///
///      WHAT THE NUMBERS ARE. They are produced by the real contracts doing
///      real arithmetic; nothing is mocked or invented. But an owner who can
///      move the clock can move the earnings, so these figures are an
///      engineering instrument, not a track record, and must never be shown to
///      an investor as performance. That distinction is the whole reason
///      `lockRealTime()` exists — see REDEPLOY_RUNBOOK section 2.
///
///      Chain-guarded to Base Sepolia and Anvil. The compressed clock has no
///      business anywhere else, and a script that can fast-forward earnings is
///      exactly the kind that must refuse to run on mainnet.
contract LifecycleFlow is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint256 internal constant ANVIL = 31337;

    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PolicyRegistry internal policies;
    InsuranceVault internal vault;
    MockUSDC internal usdc;

    address internal actor;

    /// @notice Reads the deployment record and runs the lifecycle.
    /// @dev PRIVATE_KEY is read from the environment by the CLI wrapper only;
    ///      tests call `runWithKey` directly so no environment race exists.
    function run() external {
        runWithKey(vm.envUint("PRIVATE_KEY"), vm.envOr("LIFECYCLE_DAYS", uint256(365)));
    }

    /// @param pk Key that holds the operational roles on this deployment.
    /// @param totalDays Calendar span the policy is taken through.
    function runWithKey(uint256 pk, uint256 totalDays) public {
        require(block.chainid == BASE_SEPOLIA || block.chainid == ANVIL, "LifecycleFlow: wrong chain");

        _bind();
        actor = vm.addr(pk);

        require(!_clockIsLocked(), "LifecycleFlow: real time is locked; this script cannot advance it");

        console2.log("=== NextBlock lifecycle ===");
        console2.log("vault", address(vault));
        console2.log("actor", actor);
        console2.log("span (days)", totalDays);

        vm.startBroadcast(pk);
        _grantWhatIsMissing();
        uint256 policyId = _openPosition(totalDays);
        vm.stopBroadcast();

        _report("t0 - premium received, nothing earned yet");

        // Three steps rather than one jump: a single leap to expiry shows the
        // end state and hides the shape of the curve, and the shape is what
        // tells you the accrual is linear rather than lumpy.
        uint256 step = (totalDays * 1 days) / 3;
        for (uint256 i = 1; i <= 3; ++i) {
            vm.startBroadcast(pk);
            policies.advanceTime(step);
            vm.stopBroadcast();

            // No nudge transaction is needed. UPR, totalAssets and the share
            // price are computed from the registry clock at read time, so they
            // move the moment the clock does — which is also why the app shows
            // the change without anyone touching the vault. Only
            // `accumulatedFees` is booked rather than derived, and it stays
            // latent until the next state-changing call.

            _report(string.concat("t", vm.toString(i), "/3 - after ", vm.toString((step * i) / 1 days), " days"));
        }

        _reportPolicy(policyId);
    }

    // --- Stages ---

    /// @dev `DeployStack` grants PREMIUM_DEPOSITOR_ROLE to the distributor and
    ///      to nothing else, so no wallet can fund a policy directly. That is
    ///      the right default — the production path for a ceded premium is
    ///      `PremiumDistributor.receivePremium`, which takes the protocol and
    ///      underwriting fees before forwarding the LP quota — and it is why
    ///      the same call fails from the app.
    ///
    ///      This script funds a POLICY rather than a portfolio, to watch UPR
    ///      accrue against a known duration, and that path is
    ///      `vault.depositPremium`. Granting the role is therefore deliberate
    ///      and stated: premiums booked this way skip the fee split, so the
    ///      figures produced here show the earning curve and not the protocol's
    ///      revenue. Do not read fee income off this run.
    function _grantWhatIsMissing() internal {
        bytes32 depositor = roles.PREMIUM_DEPOSITOR_ROLE();
        if (!roles.hasRole(depositor, actor)) {
            roles.grantRole(depositor, actor);
            console2.log("granted PREMIUM_DEPOSITOR_ROLE to the actor (staging only)");
        }
    }

    /// @dev Registers a policy, activates it, adds it to the vault and funds it.
    ///      Kept in one function because a half-opened position is not a state
    ///      worth reporting on.
    function _openPosition(uint256 totalDays) internal returns (uint256 policyId) {
        uint256 coverage = 500_000e6;
        uint256 premium = 50_000e6;
        uint256 lpCapital = 100_000e6;

        // An LP has to be in the vault for any of this to mean anything. With
        // no shares outstanding the price per share is an artefact of the
        // virtual-share offset rather than a return, and the figure everyone
        // actually looks at would be nonsense. Capital first, then the premium
        // that earns on top of it.
        if (!compliance.canReceive(actor)) {
            compliance.setWhitelist(actor, true);
            compliance.setKycExpiry(actor, uint64(block.timestamp + 3650 days));
        }
        usdc.mint(actor, lpCapital);
        IERC20(address(usdc)).approve(address(vault), lpCapital);
        vault.deposit(lpCapital, actor);

        policyId = policies.registerPolicy(
            string.concat("Lifecycle ", vm.toString(totalDays), "d"),
            PolicyRegistry.VerificationType.OFF_CHAIN,
            coverage,
            premium,
            totalDays * 1 days,
            actor,
            0
        );
        policies.activatePolicy(policyId);
        vault.addPolicy(policyId, 5_000);

        usdc.mint(actor, premium);
        IERC20(address(usdc)).approve(address(vault), premium);
        vault.depositPremium(policyId, premium);
    }

    // --- Reporting ---

    function _report(string memory label) internal view {
        (uint256 balance, uint256 unearned, uint256 pending,,,,,) = vault.getVaultAccounting();
        console2.log("");
        console2.log(label);
        console2.log("  balance (USDC 6dp)   ", balance);
        console2.log("  unearned premium     ", unearned);
        console2.log("  earned so far        ", balance > unearned ? balance - unearned : 0);
        console2.log("  pending claims       ", pending);
        console2.log("  totalAssets          ", vault.totalAssets());
        console2.log("  value of one share   ", vault.convertToAssets(1e18));
        console2.log("  accumulated fees     ", vault.accumulatedFees());
    }

    function _reportPolicy(uint256 policyId) internal view {
        PolicyRegistry.Policy memory p = policies.getPolicy(policyId);
        console2.log("");
        console2.log("policy at end of run");
        console2.log("  id                   ", policyId);
        console2.log("  status (0=REG 1=ACT 2=CLAIMED 3=EXPIRED)", uint256(p.status));
        console2.log("  started              ", p.startTime);
        console2.log("  duration (s)         ", p.duration);
        console2.log("  registry clock       ", policies.currentTime());
    }

    // --- Wiring ---

    function _bind() internal {
        string memory path =
            vm.envOr("DEPLOYMENT_FILE", string.concat("deployments/", vm.toString(block.chainid), "-staging.json"));
        string memory json = vm.readFile(path);
        console2.log("deployment:", path);

        usdc = MockUSDC(vm.parseJsonAddress(json, ".usdc"));
        roles = ProtocolRoles(vm.parseJsonAddress(json, ".protocolRoles"));
        compliance = ComplianceRegistry(vm.parseJsonAddress(json, ".complianceRegistry"));
        policies = PolicyRegistry(vm.parseJsonAddress(json, ".policyRegistry"));
        vault = InsuranceVault(vm.parseJsonAddress(json, ".vault"));
    }

    /// @dev The lock is one-way and older deployments predate it, so a missing
    ///      function means unlocked rather than an error. Treating a revert as
    ///      "locked" would refuse to run on exactly the deployments this script
    ///      was written for.
    function _clockIsLocked() internal view returns (bool locked) {
        (bool ok, bytes memory ret) = address(policies).staticcall(abi.encodeWithSignature("clockLocked()"));
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (bool));
    }
}
