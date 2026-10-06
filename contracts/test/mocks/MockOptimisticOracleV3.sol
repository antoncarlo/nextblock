// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {
    IOptimisticOracleV3,
    IOptimisticOracleV3CallbackRecipient
} from "../../src/interfaces/uma/IOptimisticOracleV3.sol";

/// @title MockOptimisticOracleV3
/// @author Anton Carlo Santoro
/// @notice A test double of UMA's Optimistic Oracle V3, used only by the offline unit,
///         fuzz and invariant tests. It follows UMA's rules for the parts NextBlock
///         depends on: the bond is pulled from the caller, an undisputed assertion settles
///         for the asserter once it expires, a disputed one needs the oracle's answer and
///         pays both bonds less a burned share to the winner, and callbacks are made in a
///         try/catch so that a reverting recipient cannot block settlement. The tests that
///         prove the integration against the real deployment are in test/fork.
///
///         `resolve` plays UMA's oracle: nothing here decides a dispute on its own.
contract MockOptimisticOracleV3 is IOptimisticOracleV3 {
    using SafeERC20 for IERC20;

    bytes32 public constant DEFAULT_IDENTIFIER = bytes32("ASSERT_TRUTH");

    /// @dev UMA burns half of a loser's bond by default.
    uint256 public immutable burnedBondPercentage;
    address public immutable store;

    mapping(address => bool) public whitelisted;
    mapping(address => bool) public synced;
    mapping(address => uint256) public minimumBond;

    mapping(bytes32 => Assertion) private _assertions;
    mapping(bytes32 => bool) public resolved;
    mapping(bytes32 => bool) public resolution;

    /// @notice Every assertion id, in order, so that tests can walk them.
    bytes32[] public allAssertions;

    /// @notice The claim of the most recent assertion, so that tests can read what UMA's voters would.
    bytes public lastClaim;

    constructor(uint256 burnedBondPercentage_) {
        burnedBondPercentage = burnedBondPercentage_;
        store = address(uint160(uint256(keccak256("mock.uma.store"))));
    }

    // --- test controls ---
    function setWhitelisted(address currency, bool value) external {
        whitelisted[currency] = value;
    }

    function setMinimumBond(address currency, uint256 value) external {
        minimumBond[currency] = value;
    }

    /// @notice Play UMA's oracle: rule on a disputed assertion.
    function resolve(bytes32 assertionId, bool assertedTruthfully) external {
        resolved[assertionId] = true;
        resolution[assertionId] = assertedTruthfully;
    }

    function allAssertionsLength() external view returns (uint256) {
        return allAssertions.length;
    }

    // --- IOptimisticOracleV3 ---
    function defaultIdentifier() external pure returns (bytes32) {
        return DEFAULT_IDENTIFIER;
    }

    function syncUmaParams(bytes32, address currency) external {
        require(whitelisted[currency], "Unsupported currency");
        synced[currency] = true;
    }

    function getMinimumBond(address currency) external view returns (uint256) {
        return synced[currency] ? minimumBond[currency] : 0;
    }

    function getAssertion(bytes32 assertionId) external view returns (Assertion memory) {
        return _assertions[assertionId];
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32 assertionId) {
        require(asserter != address(0), "Asserter cant be 0");
        require(synced[address(currency)], "Unsupported currency");
        require(liveness > 0, "Liveness too short");
        require(bond >= minimumBond[address(currency)], "Bond amount too low");
        require(claim.length > 0, "Claim must be non-empty");

        assertionId = keccak256(
            abi.encode(
                claim, bond, block.timestamp, liveness, currency, callbackRecipient, escalationManager, identifier
            )
        );
        require(_assertions[assertionId].asserter == address(0), "Assertion already exists");

        _assertions[assertionId] = Assertion({
            escalationManagerSettings: EscalationManagerSettings({
                arbitrateViaEscalationManager: false,
                discardOracle: false,
                validateDisputers: false,
                assertingCaller: msg.sender,
                escalationManager: escalationManager
            }),
            asserter: asserter,
            assertionTime: uint64(block.timestamp),
            settled: false,
            currency: currency,
            expirationTime: uint64(block.timestamp) + liveness,
            settlementResolution: false,
            domainId: domainId,
            identifier: identifier,
            bond: bond,
            callbackRecipient: callbackRecipient,
            disputer: address(0)
        });
        allAssertions.push(assertionId);
        lastClaim = claim;

        if (bond > 0) currency.safeTransferFrom(msg.sender, address(this), bond);
    }

    function disputeAssertion(bytes32 assertionId, address disputer) external {
        Assertion storage a = _assertions[assertionId];
        require(a.asserter != address(0), "Assertion does not exist");
        require(a.disputer == address(0), "Assertion already disputed");
        require(a.expirationTime > block.timestamp, "Assertion is expired");
        require(disputer != address(0), "Disputer cant be 0");
        a.disputer = disputer;

        if (a.bond > 0) a.currency.safeTransferFrom(msg.sender, address(this), a.bond);

        if (a.callbackRecipient != address(0)) {
            try IOptimisticOracleV3CallbackRecipient(a.callbackRecipient).assertionDisputedCallback(assertionId) {}
                catch {}
        }
    }

    function settleAssertion(bytes32 assertionId) external {
        Assertion storage a = _assertions[assertionId];
        require(a.asserter != address(0), "Assertion does not exist");
        require(!a.settled, "Assertion already settled");
        a.settled = true;

        if (a.disputer == address(0)) {
            require(a.expirationTime <= block.timestamp, "Assertion not expired");
            a.settlementResolution = true;
            if (a.bond > 0) a.currency.safeTransfer(a.asserter, a.bond);
        } else {
            require(resolved[assertionId], "Price not available");
            a.settlementResolution = resolution[assertionId];
            address winner = a.settlementResolution ? a.asserter : a.disputer;
            uint256 fee = (burnedBondPercentage * a.bond) / 1e18;
            uint256 payout = a.bond * 2 - fee;
            if (fee > 0) a.currency.safeTransfer(store, fee);
            if (payout > 0) a.currency.safeTransfer(winner, payout);
        }

        if (a.callbackRecipient != address(0)) {
            try IOptimisticOracleV3CallbackRecipient(a.callbackRecipient)
                .assertionResolvedCallback(assertionId, a.settlementResolution) {}
                catch {}
        }
    }
}
