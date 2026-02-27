// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockOracleTest is Test {
    MockOracle public oracle;
    address public admin = makeAddr("admin");
    address public notAdmin = makeAddr("notAdmin");

    function setUp() public {
        vm.prank(admin);
        oracle = new MockOracle();
    }

    function test_initialBtcPrice() public view {
        (int256 price, uint256 updatedAt) = oracle.getBtcPrice();
        assertEq(price, 85_000e8);
        assertGt(updatedAt, 0);
    }

    function test_initialFlightStatus() public view {
        (bool delayed, uint256 updatedAt) = oracle.getFlightStatus();
        assertFalse(delayed);
        assertGt(updatedAt, 0);
    }

    function test_setBtcPrice() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        (int256 price, uint256 updatedAt) = oracle.getBtcPrice();
        assertEq(price, 75_000e8);
        assertGt(updatedAt, 0);
    }

    function test_setBtcPrice_negativeReverts() public {
        vm.prank(admin);
        vm.expectRevert(MockOracle.MockOracle__InvalidPrice.selector);
        oracle.setBtcPrice(-1);
    }

    function test_setBtcPrice_zeroReverts() public {
        vm.prank(admin);
        vm.expectRevert(MockOracle.MockOracle__InvalidPrice.selector);
        oracle.setBtcPrice(0);
    }

    function test_setFlightStatus() public {
        vm.prank(admin);
        oracle.setFlightStatus(true);

        (bool delayed,) = oracle.getFlightStatus();
        assertTrue(delayed);
    }

    function test_setFlightStatus_toggle() public {
        vm.prank(admin);
        oracle.setFlightStatus(true);
        vm.prank(admin);
        oracle.setFlightStatus(false);

        (bool delayed,) = oracle.getFlightStatus();
        assertFalse(delayed);
    }

    function test_onlyAdmin_setBtcPrice() public {
        vm.prank(notAdmin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notAdmin));
        oracle.setBtcPrice(75_000e8);
    }

    function test_onlyAdmin_setFlightStatus() public {
        vm.prank(notAdmin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, notAdmin));
        oracle.setFlightStatus(true);
    }

    function test_events_btcPrice() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit MockOracle.BtcPriceUpdated(75_000e8, block.timestamp);
        oracle.setBtcPrice(75_000e8);
    }

    function test_events_flightStatus() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit MockOracle.FlightStatusUpdated(true, block.timestamp);
        oracle.setFlightStatus(true);
    }
}
