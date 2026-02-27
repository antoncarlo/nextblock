// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mock USDC token for hackathon demo. 6 decimals, public mint (no access control).
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @notice Returns 6 decimals (matching real USDC).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to any address. No access control -- demo only.
    /// @param to Recipient address
    /// @param amount Amount in 6-decimal units
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
