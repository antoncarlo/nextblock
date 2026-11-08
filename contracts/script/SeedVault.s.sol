// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";

/// @title SeedVault
/// @author Anton Carlo Santoro
/// @notice Puts the first test capital into a deployed vault through the normal deposit path, so
///         the vault holds assets, issues shares and the protocol NAV has something to attest.
///
/// @dev The deposit goes through `InsuranceVault.deposit` and nothing else: the LP must already
///      be eligible under the ComplianceRegistry, the vault cap and the investor limit apply, and
///      the resulting shares are real. No storage is written, no limit is lifted.
///
///      ELIGIBILITY. The LP is not made eligible by default. When it is not, the script stops and
///      says so. `SEED_GRANT_KYC=true` lets a broadcaster that itself holds KYC_OPERATOR_ROLE
///      whitelist the LP for a year first; that is the staging shortcut, logged loudly, and it
///      reverts for any broadcaster without the role.
///
///      ASSET. The script never mints and never simulates funds: the LP must already hold the
///      vault's real USDC. A shortfall is an error that names the amounts. Circle's public faucet
///      pays 20 USDC per address every two hours, so a seed of this size is Blocked until Circle
///      grants an allocation.
///
///      Chain-guarded to Base Sepolia and Anvil. SEED_USDC is bounded by MAX_SEED.
contract SeedVault is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint256 internal constant ANVIL = 31337;

    /// @notice Default seed: 120,000 USDC (100K and a margin).
    uint256 public constant DEFAULT_SEED = 120_000e6;
    /// @notice Ceiling for one run: 1,000,000 USDC. A test seed is not a fund raise.
    uint256 public constant MAX_SEED = 1_000_000e6;
    /// @notice KYC validity granted by the staging shortcut.
    uint64 public constant KYC_VALIDITY = 365 days;

    error SeedVault__UnsupportedChain(uint256 chainId);
    error SeedVault__NoCode(address target);
    error SeedVault__SeedOutOfBounds(uint256 assets, uint256 max);
    error SeedVault__LpNotEligible(address lp);
    error SeedVault__InsufficientAsset(address lp, uint256 have, uint256 need);
    error SeedVault__ExceedsMaxDeposit(uint256 assets, uint256 maxDeposit);
    error SeedVault__SeedFailed(string what);

    /// @notice What a seed produced.
    struct Result {
        uint256 assetsDeposited;
        uint256 sharesMinted;
        uint256 totalAssetsAfter;
        uint256 totalSupplyAfter;
    }

    /// @notice CLI entry: reads the deployment record for the current chain.
    /// @dev PRIVATE_KEY is the LP. DEPLOYMENT_FILE overrides the record path (a rehearsal file).
    function run() external returns (Result memory r) {
        string memory path = vm.envOr(
            "DEPLOYMENT_FILE",
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), "-staging.json")
        );
        string memory json = vm.readFile(path);
        address vault = vm.parseJsonAddress(json, ".vault");
        r = runWith(
            vm.envUint("PRIVATE_KEY"), vault, vm.envOr("SEED_USDC", DEFAULT_SEED), vm.envOr("SEED_GRANT_KYC", false)
        );
    }

    /// @notice Seeds `vaultAddr` with `assets` from the LP behind `pk`.
    /// @dev Tests call this directly so no test touches process-global env.
    function runWith(uint256 pk, address vaultAddr, uint256 assets, bool grantKyc) public returns (Result memory r) {
        if (block.chainid != BASE_SEPOLIA && block.chainid != ANVIL) revert SeedVault__UnsupportedChain(block.chainid);
        if (vaultAddr.code.length == 0) revert SeedVault__NoCode(vaultAddr);
        if (assets == 0 || assets > MAX_SEED) revert SeedVault__SeedOutOfBounds(assets, MAX_SEED);

        InsuranceVault vault = InsuranceVault(vaultAddr);
        IERC20 asset = IERC20(vault.asset());
        ComplianceRegistry compliance = ComplianceRegistry(address(vault.complianceRegistry()));
        address lp = vm.addr(pk);

        uint256 totalAssetsBefore = vault.totalAssets();
        console2.log("vault", vaultAddr);
        console2.log("lp", lp);
        console2.log("totalAssets before", totalAssetsBefore);

        vm.startBroadcast(pk);

        // 1. Eligibility. Never implicit.
        if (!compliance.canReceive(lp)) {
            if (!grantKyc) revert SeedVault__LpNotEligible(lp);
            console2.log("STAGING SHORTCUT: whitelisting the LP with the broadcaster's own KYC operator role");
            compliance.setWhitelist(lp, true);
            compliance.setKycExpiry(lp, uint64(block.timestamp) + KYC_VALIDITY);
            if (!compliance.canReceive(lp)) revert SeedVault__LpNotEligible(lp);
        }

        // 2. Funding. Never minted: a shortfall is reported with the amounts and the seed stops.
        uint256 have = asset.balanceOf(lp);
        if (have < assets) revert SeedVault__InsufficientAsset(lp, have, assets);

        // 3. The vault's own limits, read before the deposit rather than discovered by its revert.
        uint256 limit = vault.maxDeposit(lp);
        if (assets > limit) revert SeedVault__ExceedsMaxDeposit(assets, limit);

        // 4. Deposit.
        asset.approve(vaultAddr, assets);
        uint256 shares = vault.deposit(assets, lp);

        vm.stopBroadcast();

        r = Result({
            assetsDeposited: assets,
            sharesMinted: shares,
            totalAssetsAfter: vault.totalAssets(),
            totalSupplyAfter: vault.totalSupply()
        });
        _check(vault, lp, totalAssetsBefore, r);

        console2.log("assets deposited", r.assetsDeposited);
        console2.log("shares minted", r.sharesMinted);
        console2.log("totalAssets after", r.totalAssetsAfter);
        console2.log("totalSupply after", r.totalSupplyAfter);
    }

    function _check(InsuranceVault vault, address lp, uint256 totalAssetsBefore, Result memory r) internal view {
        if (r.sharesMinted == 0) revert SeedVault__SeedFailed("no shares minted");
        if (vault.balanceOf(lp) < r.sharesMinted) revert SeedVault__SeedFailed("lp share balance");
        if (r.totalAssetsAfter < totalAssetsBefore + r.assetsDeposited - 1) {
            revert SeedVault__SeedFailed("totalAssets did not grow by the deposit");
        }
    }
}
