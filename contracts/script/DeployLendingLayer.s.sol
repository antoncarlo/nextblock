// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {LendingMarketFactory} from "../src/lending/LendingMarketFactory.sol";

/// @title DeployLendingLayer
/// @author Anton Carlo Santoro
/// @notice Adds the permissioned lending layer to a stack generation that is
///         ALREADY deployed: a LendingMarketFactory, one LendingMarket for the
///         generation's vault, and the venue approval that lets the market
///         custody nbUSDC.
///
///         `DeployLendingMarket` deploys a whole new generation and then the
///         layer, which is the right shape for a local chain and the wrong one
///         for a chain that already has a generation people are using.
///
///         Two of the three steps are role-gated, and in a separated deployment the
///         deployer holds neither role: `createMarket` needs
///         UNDERWRITING_CURATOR_ROLE and `setApprovedVenue` needs KYC_OPERATOR_ROLE.
///         The deployer keeps OWNER_ROLE (the administrator of both) through the
///         staging deploy, so it borrows each role it lacks for the duration of the
///         script and gives it back. The finished deployment holds exactly the roles
///         it held before. After governance phase 2 the deployer has no OWNER_ROLE,
///         the borrow reverts, and the layer has to be deployed by the curator and the
///         KYC operator themselves.
contract DeployLendingLayer is Script, ProtocolRoleConstants {
    error DeployLendingLayer__UnexpectedChain(uint256 chainId);
    /// @notice The deployer lacks the roles this script needs and cannot borrow them.
    /// @param deployer The broadcaster.
    error DeployLendingLayer__CannotBorrowRoles(address deployer);

    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 public constant ANVIL_CHAIN_ID = 31337;

    // Confirmed risk parameters: LLTV 70% / liq LTV 80% / incentive 5% / fee 10%.
    uint256 internal constant LLTV_BPS = 7000;
    uint256 internal constant LIQ_LTV_BPS = 8000;
    uint256 internal constant LIQ_INCENTIVE_BPS = 500;
    uint256 internal constant PROTOCOL_FEE_BPS = 1000;
    uint256 internal constant SLOPE_PER_SECOND_WAD = 1e10; // ~31.5% APR at full utilization

    /// @notice The slice of an existing generation this script builds on.
    struct Generation {
        address usdc;
        address navOracle;
        address protocolRoles;
        address compliance;
        address vault;
    }

    LendingMarketFactory public factory;
    address public market;

    /// @dev CLI entrypoint: reads the generation from the chain's deployment record
    ///      and the fee recipient from FEE_RECIPIENT.
    function run() external {
        string memory path = _recordPath();
        string memory book = vm.readFile(path);
        Generation memory g = Generation({
            usdc: vm.parseJsonAddress(book, ".usdc"),
            navOracle: vm.parseJsonAddress(book, ".navOracle"),
            protocolRoles: vm.parseJsonAddress(book, ".protocolRoles"),
            compliance: vm.parseJsonAddress(book, ".complianceRegistry"),
            vault: vm.parseJsonAddress(book, ".vault")
        });
        runWithConfig(
            vm.envUint("PRIVATE_KEY"), g, vm.envAddress("FEE_RECIPIENT"), vm.envOr("WRITE_DEPLOYMENT_JSON", true)
        );
    }

    /// @dev Parameterized entrypoint: tests call this directly (no env races).
    /// @param pk Deployer key.
    /// @param g The generation to extend.
    /// @param feeRecipient Receives the protocol fee as supply shares; the governance Safe.
    /// @param writeJson Whether to record the factory and market in the deployment record.
    function runWithConfig(uint256 pk, Generation memory g, address feeRecipient, bool writeJson) public {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID && block.chainid != ANVIL_CHAIN_ID) {
            revert DeployLendingLayer__UnexpectedChain(block.chainid);
        }

        address deployer = vm.addr(pk);
        ProtocolRoles roles = ProtocolRoles(g.protocolRoles);
        bool hadCurator = roles.hasRole(UNDERWRITING_CURATOR_ROLE, deployer);
        bool hadKyc = roles.hasRole(KYC_OPERATOR_ROLE, deployer);

        // Fail before any broadcast opens, with a message that says what to do,
        // rather than with an opaque AccessControl revert halfway through.
        if ((!hadCurator || !hadKyc) && !roles.hasRole(OWNER_ROLE, deployer)) {
            revert DeployLendingLayer__CannotBorrowRoles(deployer);
        }

        vm.startBroadcast(pk);

        if (!hadCurator) roles.grantRole(UNDERWRITING_CURATOR_ROLE, deployer);
        if (!hadKyc) roles.grantRole(KYC_OPERATOR_ROLE, deployer);

        factory = new LendingMarketFactory(g.usdc, g.navOracle, g.protocolRoles, g.compliance);
        market = factory.createMarket(
            LendingMarketFactory.CreateParams({
                collateralVault: g.vault,
                lltvBps: LLTV_BPS,
                liqLtvBps: LIQ_LTV_BPS,
                liqIncentiveBps: LIQ_INCENTIVE_BPS,
                protocolFeeBps: PROTOCOL_FEE_BPS,
                supplyCap: 0,
                borrowCap: 0,
                feeRecipient: feeRecipient,
                baseRatePerSecondWad: 0,
                slopePerSecondWad: SLOPE_PER_SECOND_WAD
            })
        );
        ComplianceRegistry(g.compliance).setApprovedVenue(market, true);

        if (!hadCurator) roles.revokeRole(UNDERWRITING_CURATOR_ROLE, deployer);
        if (!hadKyc) roles.revokeRole(KYC_OPERATOR_ROLE, deployer);

        vm.stopBroadcast();

        if (writeJson) _record(address(factory), market);

        console2.log("=== NextBlock lending layer deployed ===");
        console2.log("factory:      ", address(factory));
        console2.log("market:       ", market);
        console2.log("collateral:   ", g.vault);
        console2.log("loan asset:   ", g.usdc);
        console2.log("fee recipient:", feeRecipient);
    }

    function _recordPath() internal view returns (string memory) {
        return string.concat("deployments/", vm.toString(block.chainid), "-staging.json");
    }

    /// @dev Adds the two addresses to the chain's deployment record. A missing
    ///      record (no deploy on this chain) is not an error here.
    function _record(address factory_, address market_) internal {
        string memory path = _recordPath();
        if (!vm.exists(path)) return;
        vm.writeJson(vm.toString(factory_), path, ".lendingFactory");
        vm.writeJson(vm.toString(market_), path, ".lendingMarket");
    }
}
