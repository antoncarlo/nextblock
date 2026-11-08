// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";

/// @title Gen3NoMockOracle
/// @notice Generation 3 drops the legacy BTC price / flight delay demo oracle. Nothing in the
///         vault ever read it, so a vault or a factory that still carries it is dead weight and
///         a mutable, owner controlled price surface on an institutional product.
contract Gen3NoMockOracleTest is Test {
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack internal deploy;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));
    }

    function test_vaultExposesNoOracleGetter() public view {
        (bool ok,) = address(deploy.vault()).staticcall(abi.encodeWithSignature("oracle()"));
        assertFalse(ok, "InsuranceVault must not expose a legacy oracle");
    }

    function test_factoryExposesNoOracleGetter() public view {
        (bool ok,) = address(deploy.factory()).staticcall(abi.encodeWithSignature("oracle()"));
        assertFalse(ok, "VaultFactory must not carry a legacy oracle");
    }
}
