// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseAgent} from "./BaseAgent.sol";
import {VaultFactory} from "../../../src/VaultFactory.sol";
import {VaultAllocator} from "../../../src/VaultAllocator.sol";
import {InsuranceVault} from "../../../src/InsuranceVault.sol";
import {PortfolioRegistry} from "../../../src/PortfolioRegistry.sol";
import {MockUSDC} from "../../../src/MockUSDC.sol";

/// @title FactoryAgent — A10
/// @author Anton Carlo Santoro
/// @notice Stands up new vaults, so the protocol is exercised as more than one
///         book at a time.
///
/// @dev Everything else in this suite runs against a single vault, which quietly
///      assumes away the question that matters most once a factory exists: does
///      a limit written for one vault still mean anything when there are five?
///
///      For percentage limits it does, and the arithmetic says so — if every
///      vault satisfies e_i <= L * b_i then sum(e_i) <= L * sum(b_i), so the
///      aggregate ratio cannot exceed L however many vaults are added. For
///      absolute ceilings it does not: N vaults each at the ceiling carry N
///      times it, which is why the allocator aggregates across the factory's
///      registry before checking one. This agent is what puts that under load
///      rather than under a fixed-number test.
///
///      Vaults are created sparingly. A run that spends its budget deploying
///      never gets far enough into any single book to find anything, and the
///      interesting states here are the ones that need capital, allocation and
///      claims to have accumulated first.
contract FactoryAgent is BaseAgent {
    VaultFactory internal immutable factory;
    VaultAllocator internal immutable allocator;
    PortfolioRegistry internal immutable portfolios;
    MockUSDC internal immutable usdc;

    address internal immutable curatorKey;
    address internal immutable stranger;

    /// @notice Ghost: vaults this agent successfully created.
    uint256 public ghostVaultsCreated;
    /// @notice True if an address without the curator role created a vault.
    bool public strangerCreatedVault;
    /// @notice True if a vault the factory never made was accepted for allocation.
    bool public unregisteredVaultAllocated;

    /// @notice A vault deployed outside the factory, kept to be refused.
    InsuranceVault public rogueVault;

    /// @notice Eligible investors, distinct from the actor list.
    address[] internal depositors;

    uint256 private salt = 1;

    constructor(
        VaultFactory factory_,
        VaultAllocator allocator_,
        PortfolioRegistry portfolios_,
        MockUSDC usdc_,
        address curatorKey_,
        address stranger_,
        InsuranceVault rogueVault_,
        address[] memory lps_
    ) {
        factory = factory_;
        allocator = allocator_;
        portfolios = portfolios_;
        usdc = usdc_;
        curatorKey = curatorKey_;
        stranger = stranger_;
        rogueVault = rogueVault_;
        actors.push(curatorKey_);
        // Deposits must come from an eligible investor. The curator holds risk
        // authority, not a whitelist entry, so funding through it would fail on
        // every call and the new vaults would sit at a zero investable base —
        // where every concentration check passes trivially.
        for (uint256 i; i < lps_.length; ++i) {
            depositors.push(lps_[i]);
        }
        _track(this.createVault.selector);
        _track(this.createVaultAsStranger.selector);
        _track(this.fundNewestVault.selector);
        _track(this.allocateFromUnregisteredVault.selector);
    }

    /// @notice Stand up a vault with sampled parameters.
    /// @dev Buffer and fee are drawn across the ranges the factory accepts, so
    ///      the multi-vault state is not four copies of one configuration.
    function createVault(uint256 bufferSeed, uint256 feeSeed) external {
        // Roughly one call in twelve. The rest of the budget belongs to the
        // agents that put capital and risk through the vaults that exist.
        if (!_chance(bufferSeed, 800)) return;
        // Eight is well past the point where an aggregation bug would show, and
        // short of the point where the run spends itself on deployment.
        if (factory.getVaults().length >= 8) return;

        uint256 n = salt++;
        uint256 buffer = _bounded(bufferSeed, 1_000, 5_000);
        uint256 fee = _bounded(feeSeed, 0, 200);

        vm.prank(curatorKey);
        try factory.createVault(
            string(abi.encodePacked("Sim Vault ", vm.toString(n))),
            string(abi.encodePacked("nbSIM", vm.toString(n))),
            string(abi.encodePacked("Sim Vault ", vm.toString(n))),
            curatorKey,
            buffer,
            fee
        ) {
            ghostVaultsCreated += 1;
            _record(this.createVault.selector, true);
        } catch {
            _record(this.createVault.selector, false);
        }
    }

    /// @notice Negative perimeter: a stranger tries to mint protocol capacity.
    /// @dev A vault the protocol recognises is a claim on the protocol's name.
    ///      If any address can create one, the registry the allocator trusts is
    ///      writable by anybody.
    function createVaultAsStranger(uint256 seed) external {
        uint256 n = salt++;

        vm.prank(stranger);
        try factory.createVault(
            string(abi.encodePacked("Rogue ", vm.toString(n))),
            string(abi.encodePacked("nbROG", vm.toString(n))),
            string(abi.encodePacked("Rogue ", vm.toString(n))),
            stranger,
            _bounded(seed, 1_000, 5_000),
            0
        ) {
            strangerCreatedVault = true;
            _record(this.createVaultAsStranger.selector, true);
        } catch {
            _record(this.createVaultAsStranger.selector, false);
        }
    }

    /// @notice Put capital into the most recently created vault.
    /// @dev A vault with no capital has an investable base of zero, so every
    ///      concentration check against it passes trivially and the multi-vault
    ///      question is never actually asked.
    function fundNewestVault(uint256 amountSeed, uint256 lpSeed) external {
        address[] memory vaults = factory.getVaults();
        if (vaults.length == 0) return;

        InsuranceVault v = InsuranceVault(vaults[vaults.length - 1]);
        if (depositors.length == 0) return;
        address lp = depositors[lpSeed % depositors.length];
        uint256 amount = _bounded(amountSeed, 10_000e6, 500_000e6);

        usdc.mint(lp, amount);
        vm.startPrank(lp);
        usdc.approve(address(v), amount);
        try v.deposit(amount, lp) {
            _record(this.fundNewestVault.selector, true);
        } catch {
            _record(this.fundNewestVault.selector, false);
        }
        vm.stopPrank();
    }

    /// @notice Negative perimeter: allocate through a vault the factory never made.
    /// @dev The rogue vault is a real InsuranceVault with the same wiring,
    ///      deployed directly. It is the honest version of this attack: not a
    ///      malformed address that would revert on any call, but a working
    ///      contract that simply is not in the registry. If the allocator will
    ///      work with it, the registry is decoration.
    function allocateFromUnregisteredVault(uint256 pidSeed, uint256 amountSeed) external {
        if (address(rogueVault) == address(0)) return;
        uint256 total = portfolios.nextPortfolioId();
        if (total == 0) return;

        uint256 pid = pidSeed % total;
        uint256 amount = _bounded(amountSeed, 1e6, 100_000e6);

        vm.prank(curatorKey);
        try allocator.proposeAllocation(address(rogueVault), pid, amount) {
            unregisteredVaultAllocated = true;
            _record(this.allocateFromUnregisteredVault.selector, true);
        } catch {
            _record(this.allocateFromUnregisteredVault.selector, false);
        }
    }

    /// @notice Vaults the factory has registered, for the orchestrator.
    function registeredVaults() external view returns (address[] memory) {
        return factory.getVaults();
    }
}
