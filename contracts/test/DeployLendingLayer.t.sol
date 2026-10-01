// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployLendingLayer} from "../script/DeployLendingLayer.s.sol";
import {DeployStack} from "../script/DeployStack.s.sol";
import {LendingMarketFactory} from "../src/lending/LendingMarketFactory.sol";
import {LendingMarket} from "../src/lending/LendingMarket.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";

/// @title DeployLendingLayerTest
/// @notice The lending layer added to a generation that already exists. The
///         interesting world is the separated one: the deployer holds neither
///         UNDERWRITING_CURATOR_ROLE nor KYC_OPERATOR_ROLE, both of which the
///         layer needs, so it has to borrow them and give them back.
contract DeployLendingLayerTest is Test {
    /// @dev Anvil default key #0 -- TESTNET PLACEHOLDER, publicly known.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    DeployStack stack;
    DeployLendingLayer layer;
    address safe;
    address curator;
    address kycOperator;

    function setUp() public {
        stack = new DeployStack();
        layer = new DeployLendingLayer();
        safe = makeAddr("safe");
        curator = makeAddr("curator");
        kycOperator = makeAddr("kycOperator");
    }

    function _generation() internal view returns (DeployLendingLayer.Generation memory) {
        return DeployLendingLayer.Generation({
            usdc: address(stack.usdc()),
            navOracle: address(stack.navOracle()),
            protocolRoles: address(stack.protocolRoles()),
            compliance: address(stack.compliance()),
            vault: address(stack.vault())
        });
    }

    function _deploySeparated() internal {
        stack.runWithRoles(
            ANVIL_PK,
            false,
            address(0),
            DeployStack.RoleConfig({
                owner: safe,
                curator: curator,
                sentinel: makeAddr("sentinel"),
                committee: makeAddr("committee"),
                allocatorBot: makeAddr("allocatorBot"),
                oracleNode: makeAddr("oracleNode"),
                cedant: makeAddr("cedant"),
                kycOperator: kycOperator
            })
        );
    }

    function test_separatedRoles_deploysTheMarketAndReturnsTheRolesItBorrowed() public {
        _deploySeparated();
        ProtocolRoles roles = stack.protocolRoles();

        // The world this is for: the deployer holds neither role up front.
        assertFalse(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), ANVIL_DEPLOYER), "precondition: curator");
        assertFalse(roles.hasRole(roles.KYC_OPERATOR_ROLE(), ANVIL_DEPLOYER), "precondition: kyc");

        layer.runWithConfig(ANVIL_PK, _generation(), safe, false);

        LendingMarketFactory factory = layer.factory();
        address market = layer.market();
        assertTrue(factory.isMarket(market), "factory tracks the market");
        assertEq(factory.getMarketCount(), 1, "one market");

        LendingMarket m = LendingMarket(market);
        assertEq(address(m.loanToken()), address(stack.usdc()), "loan asset");
        assertEq(address(m.collateralToken()), address(stack.vault()), "collateral is the generation's vault");
        assertEq(m.feeRecipient(), safe, "fees go to the governance Safe");
        assertEq(m.lltvBps(), 7000, "lltv");
        assertTrue(stack.compliance().approvedVenue(market), "market is an approved venue");

        // Borrowed and returned.
        assertFalse(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), ANVIL_DEPLOYER), "deployer kept curator");
        assertFalse(roles.hasRole(roles.KYC_OPERATOR_ROLE(), ANVIL_DEPLOYER), "deployer kept kyc");
        // The named holders were not disturbed.
        assertTrue(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), curator), "curator intact");
        assertTrue(roles.hasRole(roles.KYC_OPERATOR_ROLE(), kycOperator), "kyc operator intact");
    }

    /// @dev A single-key deployment already has both roles on the deployer. The
    ///      script must not strip roles it did not grant.
    function test_whenTheDeployerAlreadyHoldsTheRoles_theyStay() public {
        stack.runWithConfig(ANVIL_PK, false, address(0)); // all roles default to the deployer
        ProtocolRoles roles = stack.protocolRoles();

        layer.runWithConfig(ANVIL_PK, _generation(), safe, false);

        assertTrue(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), ANVIL_DEPLOYER), "curator removed");
        assertTrue(roles.hasRole(roles.KYC_OPERATOR_ROLE(), ANVIL_DEPLOYER), "kyc removed");
        assertTrue(stack.compliance().approvedVenue(layer.market()), "venue approved");
    }

    /// @dev After governance phase 2 the deployer has no OWNER_ROLE and cannot
    ///      borrow. That must be a clear error before anything is sent.
    function test_afterTheDeployerRenouncesOwnership_itRefusesWithAClearError() public {
        _deploySeparated();
        ProtocolRoles roles = stack.protocolRoles();
        bytes32 ownerRole = roles.OWNER_ROLE();
        vm.prank(ANVIL_DEPLOYER);
        roles.renounceRole(ownerRole, ANVIL_DEPLOYER);

        DeployLendingLayer.Generation memory g = _generation();
        vm.expectRevert(
            abi.encodeWithSelector(DeployLendingLayer.DeployLendingLayer__CannotBorrowRoles.selector, ANVIL_DEPLOYER)
        );
        layer.runWithConfig(ANVIL_PK, g, safe, false);
    }

    function test_rejectsUnexpectedChain() public {
        _deploySeparated();
        DeployLendingLayer.Generation memory g = _generation();
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployLendingLayer.DeployLendingLayer__UnexpectedChain.selector, 1));
        layer.runWithConfig(ANVIL_PK, g, safe, false);
    }
}
