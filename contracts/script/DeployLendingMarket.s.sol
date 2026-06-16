// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DeployStack} from "./DeployStack.s.sol";
import {LendingMarketFactory} from "../src/lending/LendingMarketFactory.sol";

/// @title DeployLendingMarket
/// @author Anton Carlo Santoro
/// @notice Deploys the permissioned lending layer on top of a fresh NextBlock
///         stack generation (whose ComplianceRegistry supports `approvedVenue`):
///         a LendingMarketFactory, one LendingMarket for the deployed vault, and
///         the KYC-operator venue approval so the market can custody nbUSDC.
///
///         Base-only: the chain guard lives in the underlying DeployStack
///         (local 31337 / Base Sepolia 84532). A fresh generation is deployed on
///         purpose — the existing staging vault is bound to a registry without
///         `approvedVenue` and cannot be repointed (immutable in its constructor).
contract DeployLendingMarket is Script {
    DeployStack public stack;
    LendingMarketFactory public factory;
    address public market;

    // Confirmed risk parameters: LLTV 70% / liq LTV 80% / incentive 5% / fee 10%.
    uint256 internal constant LLTV_BPS = 7000;
    uint256 internal constant LIQ_LTV_BPS = 8000;
    uint256 internal constant LIQ_INCENTIVE_BPS = 500;
    uint256 internal constant PROTOCOL_FEE_BPS = 1000;
    uint256 internal constant SLOPE_PER_SECOND_WAD = 1e10; // ~31.5% APR at full utilization

    function run() external {
        // 1. Fresh stack generation (chain-guarded inside DeployStack).
        stack = new DeployStack();
        stack.run();

        uint256 pk = vm.envUint("PRIVATE_KEY"); // testnet placeholder key only
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 2. Factory wired to the shared infrastructure.
        factory = new LendingMarketFactory(
            address(stack.usdc()),
            address(stack.navOracle()),
            address(stack.protocolRoles()),
            address(stack.compliance())
        );

        // 3. One market for the deployed vault (deployer holds UNDERWRITING_CURATOR_ROLE).
        market = factory.createMarket(
            LendingMarketFactory.CreateParams({
                collateralVault: address(stack.vault()),
                lltvBps: LLTV_BPS,
                liqLtvBps: LIQ_LTV_BPS,
                liqIncentiveBps: LIQ_INCENTIVE_BPS,
                protocolFeeBps: PROTOCOL_FEE_BPS,
                supplyCap: 0,
                borrowCap: 0,
                feeRecipient: deployer,
                baseRatePerSecondWad: 0,
                slopePerSecondWad: SLOPE_PER_SECOND_WAD
            })
        );

        // 4. Approve the market as a custody venue (deployer holds KYC_OPERATOR_ROLE).
        stack.compliance().setApprovedVenue(market, true);

        vm.stopBroadcast();

        console2.log("=== NextBlock lending market deployed ===");
        console2.log("factory:    ", address(factory));
        console2.log("market:     ", market);
        console2.log("collateral: ", address(stack.vault()));
        console2.log("loan asset: ", address(stack.usdc()));
    }
}
