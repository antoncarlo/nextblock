// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC public usdc;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_decimals() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_nameAndSymbol() public view {
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "USDC");
    }

    function test_mint() public {
        usdc.mint(alice, 1_000e6);
        assertEq(usdc.balanceOf(alice), 1_000e6);
    }

    function test_mint_anyoneCanMint() public {
        vm.prank(alice);
        usdc.mint(bob, 500e6);
        assertEq(usdc.balanceOf(bob), 500e6);
    }

    function test_transfer() public {
        usdc.mint(alice, 1_000e6);
        vm.prank(alice);
        usdc.transfer(bob, 400e6);
        assertEq(usdc.balanceOf(alice), 600e6);
        assertEq(usdc.balanceOf(bob), 400e6);
    }

    function testFuzz_mint(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.assume(amount < type(uint256).max / 2);
        usdc.mint(to, amount);
        assertEq(usdc.balanceOf(to), amount);
    }
}
