// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {NavOracle} from "../../../src/NavOracle.sol";
import {AIAssessor} from "../../../src/AIAssessor.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";

/// @title OracleAgent — A9
/// @author Anton Carlo Santoro
/// @notice The attesting node: publishes NAV and portfolio risk, and does so
///         badly on purpose.
///
/// @dev Until this agent existed the suite ran with no oracle wired at all, so
///      the allocation freshness guard was never once consulted and the
///      invariant covering it returned early on every call. A guard nothing has
///      ever tried to pass is not a guard; it is an untested branch with a
///      comment above it.
///
///      Four adversarial modes, each matching a defence the oracle claims to
///      have: a value beyond maxDeviationBps, confidence below the floor, a
///      zero source hash, and simple silence for longer than maxStaleness. The
///      last one is the dangerous one, because nothing reverts — the feed just
///      goes quiet, and every consumer has to notice on its own.
///
///      The agent also reaches for authority it must not have. AIAssessor
///      states in its own header that it holds none; that claim is worth only
///      as much as the attempts made against it.
contract OracleAgent is BaseAgent {
    NavOracle internal immutable nav;
    AIAssessor internal immutable assessor;
    InsuranceVault internal immutable vault;
    ClaimManager internal immutable claims;

    uint256[] internal portfolios;

    /// @notice Ghost: NAV attestations accepted.
    uint256 public ghostNavPublished;
    /// @notice Ghost: the last NAV this agent successfully published.
    uint256 public lastPublishedNav;
    /// @notice True if the oracle ever succeeded at approving a claim.
    bool public oracleApprovedClaim;
    /// @notice True if the oracle ever succeeded at moving vault assets.
    bool public oracleMovedFunds;
    /// @notice True if a below-floor confidence attestation was accepted.
    bool public lowConfidenceAccepted;
    /// @notice True if a zero source hash was accepted.
    bool public zeroSourceHashAccepted;

    uint256 private salt = 1;

    constructor(
        NavOracle nav_,
        AIAssessor assessor_,
        InsuranceVault vault_,
        ClaimManager claims_,
        address oracleKey,
        uint256[] memory portfolios_
    ) {
        nav = nav_;
        assessor = assessor_;
        vault = vault_;
        claims = claims_;
        actors.push(oracleKey);
        for (uint256 i; i < portfolios_.length; ++i) {
            portfolios.push(portfolios_[i]);
        }
        _track(this.publishHonestNav.selector);
        _track(this.publishDeviantNav.selector);
        _track(this.publishLowConfidenceNav.selector);
        _track(this.publishWithoutSource.selector);
        _track(this.publishRisk.selector);
        _track(this.reachForAuthority.selector);
    }

    /// @notice The ordinary case: a NAV close to the last one, well attested.
    /// @dev Drift of at most a few percent, because a feed that only ever
    ///      publishes wild values never establishes the baseline the deviation
    ///      guard measures against.
    function publishHonestNav(uint256 navSeed) external {
        uint256 base = lastPublishedNav == 0 ? vault.totalAssets() : lastPublishedNav;
        if (base == 0) base = 1_000_000e6;

        // ±5%: inside the 20% deviation ceiling by a comfortable margin.
        uint256 low = base - (base / 20);
        uint256 high = base + (base / 20);
        uint256 value = _bounded(navSeed, low, high);

        vm.prank(actors[0]);
        try nav.publishNav(address(vault), value, 9_000, keccak256(abi.encode("honest", salt++))) {
            lastPublishedNav = value;
            ghostNavPublished += 1;
            _record(this.publishHonestNav.selector, true);
        } catch {
            _record(this.publishHonestNav.selector, false);
        }
    }

    /// @notice Adversarial: a value far beyond the deviation ceiling.
    /// @dev The contract's own documentation says such an attestation is NOT
    ///      applied and the anomaly is flagged instead. This is what tests that
    ///      sentence.
    function publishDeviantNav(uint256 navSeed) external {
        uint256 base = lastPublishedNav == 0 ? 1_000_000e6 : lastPublishedNav;
        // Three to ten times the last value: unambiguously past a 20% ceiling.
        uint256 value = _bounded(navSeed, base * 3, base * 10);

        vm.prank(actors[0]);
        try nav.publishNav(address(vault), value, 9_000, keccak256(abi.encode("deviant", salt++))) {
            // Acceptance here is not itself a failure: the contract records the
            // anomaly rather than reverting. Deliberately not updating
            // lastPublishedNav, so a rejected value cannot become the baseline
            // the next honest publication is measured against.
            _record(this.publishDeviantNav.selector, true);
        } catch {
            _record(this.publishDeviantNav.selector, false);
        }
    }

    /// @notice Adversarial: confidence below the published floor.
    function publishLowConfidenceNav(uint256 navSeed, uint256 confSeed) external {
        uint256 base = lastPublishedNav == 0 ? 1_000_000e6 : lastPublishedNav;
        uint256 value = _bounded(navSeed, base - (base / 20), base + (base / 20));
        uint16 floorBps = nav.minConfidenceBps();
        if (floorBps == 0) return;
        uint16 confidence = uint16(_bounded(confSeed, 0, uint256(floorBps) - 1));

        vm.prank(actors[0]);
        try nav.publishNav(address(vault), value, confidence, keccak256(abi.encode("lowconf", salt++))) {
            lowConfidenceAccepted = true;
            _record(this.publishLowConfidenceNav.selector, true);
        } catch {
            _record(this.publishLowConfidenceNav.selector, false);
        }
    }

    /// @notice Adversarial: an attestation with no source to trace it to.
    /// @dev An unsourced attestation is unauditable after the fact, which for a
    ///      regulated book is the same as not having one.
    function publishWithoutSource(uint256 navSeed) external {
        uint256 base = lastPublishedNav == 0 ? 1_000_000e6 : lastPublishedNav;
        uint256 value = _bounded(navSeed, base - (base / 20), base + (base / 20));

        vm.prank(actors[0]);
        try nav.publishNav(address(vault), value, 9_000, bytes32(0)) {
            zeroSourceHashAccepted = true;
            _record(this.publishWithoutSource.selector, true);
        } catch {
            _record(this.publishWithoutSource.selector, false);
        }
    }

    /// @notice Portfolio risk scores, which the curator's decisions read from.
    function publishRisk(uint256 pidSeed, uint256 scoreSeed) external {
        if (portfolios.length == 0) return;
        uint256 pid = portfolios[pidSeed % portfolios.length];
        uint16 score = uint16(_bounded(scoreSeed, 0, 10_000));

        vm.prank(actors[0]);
        try nav.publishPortfolioRisk(pid, score, 9_000, keccak256(abi.encode("risk", salt++))) {
            _record(this.publishRisk.selector, true);
        } catch {
            _record(this.publishRisk.selector, false);
        }
    }

    /// @notice Negative perimeter: the attestor reaches for business authority.
    /// @dev AIAssessor's header states the contract has no authority. A comment
    ///      is a claim; these calls are the evidence. Approving a claim and
    ///      moving vault assets are the two powers that would turn an advisory
    ///      feed into a way to drain the book.
    function reachForAuthority(uint256 idSeed, uint256 amountSeed) external {
        uint256 claimId = _bounded(idSeed, 0, 20);
        uint256 amount = _bounded(amountSeed, 1e6, 100_000e6);
        address oracleKey = actors[0];

        vm.startPrank(oracleKey);
        try claims.approveClaim(claimId, amount) {
            oracleApprovedClaim = true;
        } catch {}
        try vault.withdraw(amount, oracleKey, oracleKey) {
            oracleMovedFunds = true;
        } catch {}
        try vault.claimFees(oracleKey) {
            oracleMovedFunds = true;
        } catch {}
        vm.stopPrank();

        _record(this.reachForAuthority.selector, true);
    }

    /// @notice The assessor address, so the orchestrator can assert it holds nothing.
    function assessorAddress() external view returns (address) {
        return address(assessor);
    }
}
