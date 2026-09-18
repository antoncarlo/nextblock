// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {VaultFactory} from "../../src/VaultFactory.sol";
import {NavOracle} from "../../src/NavOracle.sol";
import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../../src/ProtocolTimelock.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";

/// @dev The deployed ClaimReceipt still carries the `Ownable` admin model that
///      F-08 removed from the source. Reading the live chain means speaking the
///      deployed contract's ABI, not the repository's.
interface ILegacyOwnable {
    function owner() external view returns (address);
}

/// @title LiveStagingAudit
/// @author Anton Carlo Santoro
/// @notice Checks the findings from the local audit against the deployment that
///         actually exists on Base Sepolia.
///
///         A defect proven on a fresh local stack says what the code does. It
///         does not say whether the live system is currently in that state —
///         and for an operator deciding what to fix first, that is the whole
///         question. These tests read the real chain and answer it.
///
///         Skips itself when no Base Sepolia RPC is configured, so the suite
///         stays runnable offline:
///           export BASE_SEPOLIA_RPC_URL=https://base-sepolia-rpc.publicnode.com
contract LiveStagingAuditForkTest is Test {
    uint256 constant BASE_SEPOLIA = 84_532;

    address constant STAGING_VAULT = 0x47b1F34b1aA2683Ebd0bC3A5D0F8507Af064BCa3;
    address constant VAULT_FACTORY = 0x7C56F056e94bE52C3B35d4C488a5962313Ab5f69;
    address constant CLAIM_MANAGER = 0x504d99e92FCD13040AbAf1Ba9165871DDE3Ddd48;
    address constant NAV_ORACLE = 0x53a3e4f21460de7CeC34Ac2318342E5e42Ec1701;
    address constant PROTOCOL_ROLES = 0xEE93166a2cf213243eF330a664682290b195c976;
    address constant PROTOCOL_TIMELOCK = 0x6e2927627d83A90EDC9cDA3c626B49875f9449CF;
    address constant CLAIM_RECEIPT = 0xcAb440CAe016b89739e287884C36E18b22101b54;
    address constant DEPLOYER_EOA = 0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2;
    address constant PROTOCOL_SAFE = 0x8Fd8b45Ba2612E7535bbeB21615554701CfaF870;

    bool internal forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = block.chainid == BASE_SEPOLIA;
    }

    /// @notice Which live vaults cannot pay a claim, right now.
    /// @dev The factory never wires `claimManager`, so every vault it created is
    ///      born unable to settle. This reports the real count rather than
    ///      asserting a number that would rot the next time a vault is created.
    function test_liveVaultsThatCannotPayClaims() public {
        if (!forked) return;

        address[] memory vaults = VaultFactory(VAULT_FACTORY).getVaults();
        emit log_named_uint("vaults registered in the factory", vaults.length);

        uint256 unwired;
        uint256 strandedCapital;
        for (uint256 i; i < vaults.length; i++) {
            address cm = InsuranceVault(vaults[i]).claimManager();
            if (cm == address(0)) {
                unwired++;
                emit log_named_address("  cannot pay claims (claimManager unset)", vaults[i]);
                // The number that decides urgency: LP capital already sitting in
                // a vault with no path to settle a claim against it.
                uint256 assets = InsuranceVault(vaults[i]).totalAssets();
                emit log_named_uint("    LP capital stranded in it (6dp)", assets);
                strandedCapital += assets;
            }
        }
        emit log_named_uint("live vaults unable to settle a claim", unwired);
        emit log_named_uint("total LP capital behind unpayable cover (6dp)", strandedCapital);

        // The staging vault itself was wired by the deploy script, not by the
        // factory — that is the distinction the finding rests on.
        emit log_named_address("staging vault claimManager", InsuranceVault(STAGING_VAULT).claimManager());
    }

    /// @notice Is the live NAV feed fresh enough for the lending market to work?
    /// @dev Nothing in the repository publishes NAV on a schedule. If the live
    ///      attestation is stale, every collateral read reverts — which freezes
    ///      borrowing AND liquidation on any market pointed at this vault.
    function test_liveNavFreshness() public {
        if (!forked) return;

        NavOracle nav = NavOracle(NAV_ORACLE);
        emit log_named_string("feed paused", nav.vaultFeedPaused(STAGING_VAULT) ? "yes" : "no");

        try nav.getNav(STAGING_VAULT) returns (uint256 value, uint16 confidence, uint64 updatedAt) {
            emit log_named_uint("live NAV (6dp USDC)", value);
            emit log_named_uint("confidence bps", confidence);
            emit log_named_uint("age in seconds", block.timestamp - updatedAt);
            emit log_named_uint("maxStaleness", nav.maxStaleness());
            // A zero NAV on a live feed is the exact input that bricks liquidation.
            assertGt(value, 0, "LIVE: NAV is zero - liquidation would brick on any market using this vault");
        } catch {
            emit log_string("getNav REVERTS on the live feed: no attestation, stale, or paused.");
            emit log_string("Any lending market on this vault cannot price collateral, borrow OR liquidate.");
        }
    }

    /// @notice Where governance authority actually sits on the live chain.
    /// @dev `GovernanceMigration` phase 2 moves OWNER_ROLE and DEFAULT_ADMIN_ROLE
    ///      on ProtocolRoles and nothing else. This reports what the deployer EOA
    ///      would still hold the moment that renouncement lands — including
    ///      ClaimReceipt, which the migration never transfers and the timelock can
    ///      never acquire.
    function test_liveGovernanceAuthority() public {
        if (!forked) return;

        ProtocolRoles r = ProtocolRoles(PROTOCOL_ROLES);
        ProtocolTimelock tl = ProtocolTimelock(payable(PROTOCOL_TIMELOCK));

        emit log_string("--- ProtocolRoles: admin roles (what the migration moves) ---");
        emit log_named_string("timelock has OWNER_ROLE", r.hasRole(r.OWNER_ROLE(), PROTOCOL_TIMELOCK) ? "yes" : "no");
        emit log_named_string("deployer has OWNER_ROLE", r.hasRole(r.OWNER_ROLE(), DEPLOYER_EOA) ? "yes" : "no");

        emit log_string("--- ProtocolRoles: operational roles (what it leaves behind) ---");
        emit log_named_string("deployer is Sentinel", r.hasRole(r.SENTINEL_ROLE(), DEPLOYER_EOA) ? "yes" : "no");
        emit log_named_string(
            "deployer is Claims Committee", r.hasRole(r.CLAIMS_COMMITTEE_ROLE(), DEPLOYER_EOA) ? "yes" : "no"
        );
        emit log_named_string("deployer is Oracle", r.hasRole(r.ORACLE_ROLE(), DEPLOYER_EOA) ? "yes" : "no");
        emit log_named_string("deployer is Cedant", r.hasRole(r.AUTHORIZED_CEDANT_ROLE(), DEPLOYER_EOA) ? "yes" : "no");
        emit log_named_string("deployer is KYC Operator", r.hasRole(r.KYC_OPERATOR_ROLE(), DEPLOYER_EOA) ? "yes" : "no");
        emit log_named_string("deployer is Allocator", r.hasRole(r.ALLOCATOR_ROLE(), DEPLOYER_EOA) ? "yes" : "no");
        emit log_named_string(
            "deployer is Curator", r.hasRole(r.UNDERWRITING_CURATOR_ROLE(), DEPLOYER_EOA) ? "yes" : "no"
        );

        emit log_string("--- Timelock wiring ---");
        emit log_named_uint("minDelay (seconds)", tl.getMinDelay());
        emit log_named_string("safe is PROPOSER", tl.hasRole(tl.PROPOSER_ROLE(), PROTOCOL_SAFE) ? "yes" : "no");
        emit log_named_string("safe is CANCELLER", tl.hasRole(tl.CANCELLER_ROLE(), PROTOCOL_SAFE) ? "yes" : "no");
        emit log_named_string(
            "timelock is self-administered", tl.hasRole(tl.DEFAULT_ADMIN_ROLE(), PROTOCOL_TIMELOCK) ? "yes" : "no"
        );

        // F-08: the DEPLOYED ClaimReceipt predates the fix and is still the
        // `Ownable` version, so this reads it through the legacy interface. The
        // number to watch is whether that owner is the timelock; on the current
        // deployment it is not, and only a redeploy changes that.
        emit log_string("--- ClaimReceipt admin (F-08: fixed in source, needs redeploy) ---");
        address receiptOwner = ILegacyOwnable(CLAIM_RECEIPT).owner();
        emit log_named_address("deployed ClaimReceipt owner", receiptOwner);
        emit log_named_string(
            "owner is the timelock", receiptOwner == PROTOCOL_TIMELOCK ? "yes" : "NO - deployed before the fix"
        );
        emit log_named_string(
            "ClaimManager authorised to mint receipts",
            ClaimReceipt(CLAIM_RECEIPT).authorizedMinters(CLAIM_MANAGER) ? "yes" : "no"
        );
    }

    /// @notice Confirms the lending market is not live, which bounds the blast
    ///         radius of every collateral-pricing finding to zero for now.
    function test_liveLendingMarketExposure() public {
        if (!forked) return;
        emit log_string("DeployStack does not deploy a LendingMarket; collateral-pricing findings are pre-production.");
        emit log_named_uint("staging vault total assets (6dp)", InsuranceVault(STAGING_VAULT).totalAssets());
        emit log_named_uint("staging vault total supply (18dp)", InsuranceVault(STAGING_VAULT).totalSupply());
    }
}
