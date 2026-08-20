// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {ClaimManager} from "../../../src/ClaimManager.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";

/// @title CedantAgent — A6
/// @author Anton Carlo Santoro
/// @notice The ceding parties: they submit portfolios and file claims against
///         their own, and must fail at filing against anybody else's.
/// @dev Several cedants rather than one, because the interesting question is
///      not whether a cedant can claim — it is whether cedant B can claim on
///      cedant A's portfolio. With a single cedant that question cannot even be
///      asked, and the aggregate concentration limit has nothing to bind.
///
///      Claim sizes are drawn across the whole range up to the coverage limit,
///      and one call in five deliberately exceeds it. A protocol that has never
///      been asked for more than it covers has not proved it would refuse.
contract CedantAgent is BaseAgent {
    ClaimManager internal immutable claims;
    PortfolioRegistry internal immutable portfolios;
    InsuranceVault internal immutable vault;

    /// @notice Portfolio ids owned by each actor, by the same index.
    uint256[] internal ownedPortfolio;

    /// @notice Ghost: claims filed successfully.
    uint256 public ghostClaimsFiled;
    /// @notice True if a cedant ever claimed on a portfolio it does not own.
    bool public claimedOnForeignPortfolio;
    /// @notice True if a claim above the coverage limit was ever accepted.
    bool public overCoverageAccepted;

    uint256 private salt = 1;

    constructor(
        ClaimManager claims_,
        PortfolioRegistry portfolios_,
        InsuranceVault vault_,
        address[] memory cedants,
        uint256[] memory ownedIds
    ) {
        claims = claims_;
        portfolios = portfolios_;
        vault = vault_;
        require(cedants.length == ownedIds.length, "CedantAgent: pair the cedants with their portfolios");
        for (uint256 i; i < cedants.length; ++i) {
            actors.push(cedants[i]);
            ownedPortfolio.push(ownedIds[i]);
        }
        _track(this.claimOwn.selector);
        _track(this.claimForeign.selector);
        _track(this.claimAboveCoverage.selector);
        _track(this.submitNewPortfolio.selector);
    }

    /// @notice Cede a fresh book into the pipeline.
    /// @dev Without a steady supply of newly submitted portfolios the curator
    ///      agent has nothing to review: every book in the suite is already
    ///      active, so the state machine is walked once in setUp and never
    ///      again. The interesting transitions are the ones taken under load,
    ///      alongside allocation and claims, not the ones taken in isolation.
    function submitNewPortfolio(uint256 actorSeed, uint256 coverageSeed, uint256 tenorSeed) external {
        uint256 idx = actorSeed % actors.length;
        uint256 coverage = _bounded(coverageSeed, 100_000e6, 10_000_000e6);
        // Seven days to a year: the tenors the owner asked to see run end to end.
        uint64 tenor = uint64(_bounded(tenorSeed, 7 days, 365 days));
        uint256 n = salt++;

        vm.prank(actors[idx]);
        try portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: string(abi.encodePacked("Ceded Book ", vm.toString(n))),
                metadataURI: "ipfs://QmCeded",
                documentHash: keccak256(abi.encode("ceded", n)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: coverage,
                cededPremium: coverage / 20,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp) + tenor
            })
        ) {
            _record(this.submitNewPortfolio.selector, true);
        } catch {
            _record(this.submitNewPortfolio.selector, false);
        }
    }

    /// @notice File a claim on a portfolio this cedant owns.
    function claimOwn(uint256 actorSeed, uint256 amountSeed) external {
        uint256 idx = actorSeed % actors.length;
        uint256 pid = ownedPortfolio[idx];

        PortfolioRegistry.Portfolio memory pf = portfolios.getPortfolio(pid);
        if (pf.coverageLimit == 0) {
            _record(this.claimOwn.selector, false);
            return;
        }
        uint256 amount = _bounded(amountSeed, 1, pf.coverageLimit);

        vm.prank(actors[idx]);
        try claims.submitClaim(
            address(vault), pid, amount, ClaimManager.ClaimType.PARAMETRIC, keccak256(abi.encode(salt++))
        ) {
            ghostClaimsFiled += 1;
            _record(this.claimOwn.selector, true);
        } catch {
            _record(this.claimOwn.selector, false);
        }
    }

    /// @notice Negative perimeter: claim on a portfolio owned by another cedant.
    /// @dev The single most consequential denial in this agent. A cedant able to
    ///      claim against a portfolio it never ceded can drain a vault through
    ///      exposure it never took on.
    function claimForeign(uint256 actorSeed, uint256 amountSeed) external {
        if (actors.length < 2) return;
        uint256 idx = actorSeed % actors.length;
        uint256 otherIdx = (idx + 1) % actors.length;
        uint256 foreignPid = ownedPortfolio[otherIdx];

        PortfolioRegistry.Portfolio memory pf = portfolios.getPortfolio(foreignPid);
        if (pf.coverageLimit == 0) {
            _record(this.claimForeign.selector, false);
            return;
        }
        uint256 amount = _bounded(amountSeed, 1, pf.coverageLimit);

        vm.prank(actors[idx]);
        try claims.submitClaim(
            address(vault), foreignPid, amount, ClaimManager.ClaimType.PARAMETRIC, keccak256(abi.encode(salt++))
        ) {
            claimedOnForeignPortfolio = true;
            _record(this.claimForeign.selector, true);
        } catch {
            _record(this.claimForeign.selector, false);
        }
    }

    /// @notice Negative perimeter: ask for more than the portfolio covers.
    function claimAboveCoverage(uint256 actorSeed) external {
        uint256 idx = actorSeed % actors.length;
        uint256 pid = ownedPortfolio[idx];

        PortfolioRegistry.Portfolio memory pf = portfolios.getPortfolio(pid);
        if (pf.coverageLimit == 0) {
            _record(this.claimAboveCoverage.selector, false);
            return;
        }

        // One unit over: the smallest request that must be refused. A wildly
        // larger figure could revert for an unrelated reason and prove nothing
        // about the coverage ceiling.
        vm.prank(actors[idx]);
        try claims.submitClaim(
            address(vault), pid, pf.coverageLimit + 1, ClaimManager.ClaimType.PARAMETRIC, keccak256(abi.encode(salt++))
        ) {
            overCoverageAccepted = true;
            _record(this.claimAboveCoverage.selector, true);
        } catch {
            _record(this.claimAboveCoverage.selector, false);
        }
    }

    /// @notice The cedant registered against a portfolio this agent drives.
    function ownerOf(uint256 index) external view returns (address) {
        return actors[index % actors.length];
    }

    /// @notice Portfolio this agent's actor at `index` owns.
    function portfolioOf(uint256 index) external view returns (uint256) {
        return ownedPortfolio[index % ownedPortfolio.length];
    }

    /// @notice Number of cedants this agent drives.
    function cedantCount() external view returns (uint256) {
        return actors.length;
    }
}
