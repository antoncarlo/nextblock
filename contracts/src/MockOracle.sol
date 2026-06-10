// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockOracle
/// @notice Admin-controlled oracle for BTC price and flight delay status.
/// @dev Prices use 8 decimals (Chainlink convention). Flight status is a simple boolean.
contract MockOracle is Ownable {
    // --- State ---
    int256 public btcPrice;
    bool public flightDelayed;
    uint256 public lastBtcUpdate;
    uint256 public lastFlightUpdate;

    // --- Events ---
    event BtcPriceUpdated(int256 price, uint256 timestamp);
    event FlightStatusUpdated(bool delayed, uint256 timestamp);

    // --- Errors ---
    error MockOracle__InvalidPrice();

    /// @notice Initializes BTC price to $85,000 and flight status to false.
    constructor() Ownable(msg.sender) {
        btcPrice = 85_000e8;
        lastBtcUpdate = block.timestamp;
        flightDelayed = false;
        lastFlightUpdate = block.timestamp;
    }

    /// @notice Set the BTC price (8 decimals). Only owner.
    /// @param price New BTC price in 8-decimal format (e.g., 85000e8 = $85,000)
    function setBtcPrice(int256 price) external onlyOwner {
        if (price <= 0) revert MockOracle__InvalidPrice();
        btcPrice = price;
        lastBtcUpdate = block.timestamp;
        emit BtcPriceUpdated(price, block.timestamp);
    }

    /// @notice Set the flight delay status. Only owner.
    /// @param delayed Whether the flight is delayed
    function setFlightStatus(bool delayed) external onlyOwner {
        flightDelayed = delayed;
        lastFlightUpdate = block.timestamp;
        emit FlightStatusUpdated(delayed, block.timestamp);
    }

    /// @notice Get the current BTC price and when it was last updated.
    /// @return price BTC price in 8-decimal format
    /// @return updatedAt Timestamp of last update
    function getBtcPrice() external view returns (int256 price, uint256 updatedAt) {
        return (btcPrice, lastBtcUpdate);
    }

    /// @notice Get the current flight delay status and when it was last updated.
    /// @return delayed Whether the flight is delayed
    /// @return updatedAt Timestamp of last update
    function getFlightStatus() external view returns (bool delayed, uint256 updatedAt) {
        return (flightDelayed, lastFlightUpdate);
    }
}
