// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IOptimisticOracleV3
/// @author Anton Carlo Santoro
/// @notice The part of UMA's Optimistic Oracle V3 that NextBlock uses, written against
///         UMA's published interface and checked against the deployment on Base Sepolia
///         (test/fork/UmaBordereauFork.t.sol decodes a live assertion through it). It is
///         an interface only: nothing of UMA's implementation is reproduced here.
///
///         An assertion is a bonded claim. Anyone may dispute it, with an equal bond,
///         until it expires; an undisputed assertion settles in the asserter's favour and
///         returns the bond; a disputed one is decided by UMA's oracle, and the loser's
///         bond goes to the winner less a burned share.
interface IOptimisticOracleV3 {
    struct EscalationManagerSettings {
        bool arbitrateViaEscalationManager;
        bool discardOracle;
        bool validateDisputers;
        address assertingCaller;
        address escalationManager;
    }

    struct Assertion {
        EscalationManagerSettings escalationManagerSettings;
        address asserter;
        uint64 assertionTime;
        bool settled;
        IERC20 currency;
        uint64 expirationTime;
        bool settlementResolution;
        bytes32 domainId;
        bytes32 identifier;
        uint256 bond;
        address callbackRecipient;
        address disputer;
    }

    /// @notice Make a bonded claim. The bond is pulled from msg.sender and returned to
    ///         `asserter` if the assertion stands.
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
    ) external returns (bytes32 assertionId);

    /// @notice Dispute an assertion before it expires. The bond is pulled from msg.sender;
    ///         `disputer` receives the winnings.
    function disputeAssertion(bytes32 assertionId, address disputer) external;

    /// @notice Settle an assertion that has expired undisputed, or whose dispute UMA has
    ///         resolved. Permissionless.
    function settleAssertion(bytes32 assertionId) external;

    /// @notice Cache UMA's whitelist status and final fee for a currency. Required once
    ///         before a currency can be used for bonds; reverts if UMA does not accept it.
    function syncUmaParams(bytes32 identifier, address currency) external;

    /// @notice The full record UMA keeps for an assertion (an empty record if unknown).
    function getAssertion(bytes32 assertionId) external view returns (Assertion memory);

    /// @notice The smallest bond UMA accepts in a currency: its final fee over the burned share.
    function getMinimumBond(address currency) external view returns (uint256);

    /// @notice The identifier assertions are made under unless stated otherwise (ASSERT_TRUTH).
    function defaultIdentifier() external view returns (bytes32);
}

/// @notice What the oracle calls on the contract that made the assertion.
interface IOptimisticOracleV3CallbackRecipient {
    /// @notice Called when the assertion settles. `assertedTruthfully` is the outcome.
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    /// @notice Called when somebody disputes the assertion.
    function assertionDisputedCallback(bytes32 assertionId) external;
}
