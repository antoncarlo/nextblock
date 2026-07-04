// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mock USDC for local Anvil and Base Sepolia STAGING ONLY (never
///         mainnet). 6 decimals. Minting is a capped faucet: anyone may mint up
///         to FAUCET_CAP per call (demo/testing), the deployer is uncapped
///         (seeding). Real value never flows through this token.
contract MockUSDC is ERC20 {
    /// @notice Max mint per call for non-deployer callers: 100M USDC.
    uint256 public constant FAUCET_CAP = 100_000_000e6;

    /// @notice Deployer (uncapped mint for demo seeding).
    address public immutable deployer;

    /// @notice Faucet request exceeds the per-call cap.
    error MockUSDC__FaucetCapExceeded(uint256 requested, uint256 cap);

    /// @notice Deploys the 6-decimals staging USDC mock.
    constructor() ERC20("Mock USDC", "USDC") {
        deployer = msg.sender;
    }

    /// @notice Returns 6 decimals (matching real USDC).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Capped faucet mint. Deployer is uncapped; everyone else is
    ///         limited to FAUCET_CAP per call. Staging only.
    /// @param to Recipient address
    /// @param amount Amount in 6-decimal units
    function mint(address to, uint256 amount) external {
        if (msg.sender != deployer && amount > FAUCET_CAP) {
            revert MockUSDC__FaucetCapExceeded(amount, FAUCET_CAP);
        }
        _mint(to, amount);
    }
}
