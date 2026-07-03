// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title PolicyRegistry
/// @notice Pure data store for insurance policies + single source of truth for virtual time.
/// @dev Vaults read policy data and currentTime() from this contract.
///      PolicyRegistry does NOT process claims -- that is the vault's responsibility.
///      Access control: gated on-chain via the central ProtocolRoles manager.
///      Ownable is retained ONLY for owner() ABI compatibility with the frontend;
///      no function is gated by onlyOwner.
contract PolicyRegistry is Ownable, ProtocolRoleConstants {
    // --- Enums ---
    enum VerificationType {
        ON_CHAIN, // 0: Trigger verifiable on-chain (e.g., BTC price)
        ORACLE_DEPENDENT, // 1: Requires oracle data (e.g., flight delay)
        OFF_CHAIN // 2: Manual insurer assessment (e.g., commercial fire)
    }

    enum PolicyStatus {
        REGISTERED, // 0: Created but not yet active
        ACTIVE, // 1: Active and accruing premium
        CLAIMED, // 2: Claim triggered (set by vault, not registry)
        EXPIRED // 3: Duration elapsed without claim
    }

    // --- Structs ---
    struct Policy {
        uint256 id;
        string name;
        VerificationType verificationType;
        uint256 coverageAmount; // USDC 6 decimals
        uint256 premiumAmount; // USDC 6 decimals
        uint256 duration; // seconds
        uint256 startTime; // set on activatePolicy()
        address insurer; // receives ClaimReceipt on claim
        int256 triggerThreshold; // ON_CHAIN: BTC price threshold (8 dec). Others: unused.
        PolicyStatus status;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Monotonic id of the next policy.
    uint256 public nextPolicyId;
    /// @notice Policy data by id.
    mapping(uint256 => Policy) public policies;

    /// @notice Time offset for the (optional) virtual clock. Single source of
    ///         truth for all contracts. Used only for demos/walkthroughs; a
    ///         production deployment locks it to zero via lockRealTime().
    uint256 public timeOffset;

    /// @notice Once true, timeOffset is permanently zero and advanceTime() is
    ///         disabled: currentTime() is provably block.timestamp forever. This
    ///         is the one-way switch a real (re)insurance test flips so no actor
    ///         — not even the owner — can fast-forward premium/UPR/fee accrual.
    bool public clockLocked;

    // --- Events ---
    /// @notice Emitted when a cedant registers a policy.
    event PolicyRegistered(uint256 indexed policyId, string name, VerificationType verificationType);
    /// @notice Emitted when the curator activates a policy (startTime set).
    event PolicyActivated(uint256 indexed policyId, uint256 startTime);
    /// @notice Emitted when the demo virtual clock advances.
    event TimeAdvanced(uint256 newTimestamp, uint256 secondsAdded);
    /// @notice Emitted once when the virtual clock is permanently locked to real time.
    event RealTimeLocked(uint256 at);

    // --- Errors ---
    /// @notice No policy under this id.
    error PolicyRegistry__PolicyNotFound(uint256 policyId);
    /// @notice Policy is not in the status required by this transition.
    error PolicyRegistry__InvalidStatus(uint256 policyId, PolicyStatus current, PolicyStatus expected);
    /// @notice Zero address/value or otherwise malformed parameters.
    error PolicyRegistry__InvalidParams();
    /// @notice Caller lacks the required ProtocolRoles role.
    error PolicyRegistry__UnauthorizedRole(address caller, bytes32 role);
    /// @notice Time-travel is disabled because real time has been locked in.
    error PolicyRegistry__ClockLocked();

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert PolicyRegistry__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @param protocolRoles_ Address of the deployed ProtocolRoles access manager.
    constructor(address protocolRoles_) Ownable(msg.sender) {
        if (protocolRoles_ == address(0)) revert PolicyRegistry__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
    }

    // --- Time Management ---

    /// @notice Returns current time (block.timestamp + timeOffset). After
    ///         lockRealTime() the offset is zero forever, so this equals the
    ///         real block timestamp.
    function currentTime() public view returns (uint256) {
        return block.timestamp + timeOffset;
    }

    /// @notice Advance the virtual clock. Only OWNER_ROLE (demo/keeper control).
    ///         Reverts once real time has been locked in.
    /// @param secondsToAdd Number of seconds to advance
    function advanceTime(uint256 secondsToAdd) external onlyProtocolRole(OWNER_ROLE) {
        if (clockLocked) revert PolicyRegistry__ClockLocked();
        timeOffset += secondsToAdd;
        emit TimeAdvanced(currentTime(), secondsToAdd);
    }

    /// @notice Permanently switch the protocol to real time: zero the virtual
    ///         offset and disable advanceTime() forever. One-way and idempotent-
    ///         safe (a second call reverts). Flip this before a real
    ///         (re)insurance test so premium earning, UPR recognition and fee
    ///         accrual run on the true block clock — a truthful test, not a
    ///         fast-forwarded demo. Only OWNER_ROLE.
    function lockRealTime() external onlyProtocolRole(OWNER_ROLE) {
        if (clockLocked) revert PolicyRegistry__ClockLocked();
        timeOffset = 0;
        clockLocked = true;
        emit RealTimeLocked(block.timestamp);
    }

    // --- Policy Lifecycle ---

    /// @notice Register a new policy. Status starts as REGISTERED.
    /// @param name Human-readable policy name
    /// @param verificationType How claims are verified (ON_CHAIN, ORACLE_DEPENDENT, OFF_CHAIN)
    /// @param coverageAmount Maximum payout in USDC (6 decimals)
    /// @param premiumAmount Premium to be paid (6 decimals)
    /// @param duration Policy duration in seconds
    /// @param insurer Address that receives ClaimReceipt on trigger
    /// @param triggerThreshold For ON_CHAIN: price threshold (8 decimals). Unused otherwise.
    /// @return policyId The ID of the newly registered policy
    function registerPolicy(
        string calldata name,
        VerificationType verificationType,
        uint256 coverageAmount,
        uint256 premiumAmount,
        uint256 duration,
        address insurer,
        int256 triggerThreshold
    ) external onlyProtocolRole(AUTHORIZED_CEDANT_ROLE) returns (uint256 policyId) {
        if (coverageAmount == 0 || premiumAmount == 0 || duration == 0 || insurer == address(0)) {
            revert PolicyRegistry__InvalidParams();
        }

        policyId = nextPolicyId++;

        policies[policyId] = Policy({
            id: policyId,
            name: name,
            verificationType: verificationType,
            coverageAmount: coverageAmount,
            premiumAmount: premiumAmount,
            duration: duration,
            startTime: 0,
            insurer: insurer,
            triggerThreshold: triggerThreshold,
            status: PolicyStatus.REGISTERED
        });

        emit PolicyRegistered(policyId, name, verificationType);
    }

    /// @notice Activate a registered policy. Sets startTime to currentTime().
    ///         Only UNDERWRITING_CURATOR_ROLE (Syndicate / Underwriting Curator approval).
    /// @param policyId The policy to activate
    function activatePolicy(uint256 policyId) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) {
        Policy storage policy = policies[policyId];
        if (policy.coverageAmount == 0) revert PolicyRegistry__PolicyNotFound(policyId);
        if (policy.status != PolicyStatus.REGISTERED) {
            revert PolicyRegistry__InvalidStatus(policyId, policy.status, PolicyStatus.REGISTERED);
        }

        policy.status = PolicyStatus.ACTIVE;
        policy.startTime = currentTime();

        emit PolicyActivated(policyId, policy.startTime);
    }

    // --- Read Functions ---

    /// @notice Get full policy data.
    /// @param policyId The policy to query
    /// @return policy The policy struct
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = policies[policyId];
        if (policy.coverageAmount == 0 && policy.premiumAmount == 0) {
            revert PolicyRegistry__PolicyNotFound(policyId);
        }
        return policy;
    }

    /// @notice Get the total number of registered policies.
    function getPolicyCount() external view returns (uint256) {
        return nextPolicyId;
    }

    /// @notice Check if a policy has expired based on virtual time.
    /// @param policyId The policy to check
    /// @return expired True if the policy duration has elapsed
    function isPolicyExpired(uint256 policyId) public view returns (bool) {
        Policy memory policy = policies[policyId];
        if (policy.status != PolicyStatus.ACTIVE) return false;
        return currentTime() >= policy.startTime + policy.duration;
    }

    /// @notice Get remaining duration of an active policy.
    /// @param policyId The policy to check
    /// @return remaining Seconds remaining (0 if expired or not active)
    function getRemainingDuration(uint256 policyId) public view returns (uint256) {
        Policy memory policy = policies[policyId];
        if (policy.status != PolicyStatus.ACTIVE) return 0;

        uint256 endTime = policy.startTime + policy.duration;
        if (currentTime() >= endTime) return 0;
        return endTime - currentTime();
    }
}
