// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PolicyRegistry
/// @notice Pure data store for insurance policies + single source of truth for virtual time.
/// @dev Vaults read policy data and currentTime() from this contract.
///      PolicyRegistry does NOT process claims -- that is the vault's responsibility.
contract PolicyRegistry is Ownable {
    // --- Enums ---
    enum VerificationType {
        ON_CHAIN,          // 0: Trigger verifiable on-chain (e.g., BTC price)
        ORACLE_DEPENDENT,  // 1: Requires oracle data (e.g., flight delay)
        OFF_CHAIN          // 2: Manual insurer assessment (e.g., commercial fire)
    }

    enum PolicyStatus {
        REGISTERED,  // 0: Created but not yet active
        ACTIVE,      // 1: Active and accruing premium
        CLAIMED,     // 2: Claim triggered (set by vault, not registry)
        EXPIRED      // 3: Duration elapsed without claim
    }

    // --- Structs ---
    struct Policy {
        uint256 id;
        string name;
        VerificationType verificationType;
        uint256 coverageAmount;     // USDC 6 decimals
        uint256 premiumAmount;      // USDC 6 decimals
        uint256 duration;           // seconds
        uint256 startTime;          // set on activatePolicy()
        address insurer;            // receives ClaimReceipt on claim
        int256 triggerThreshold;    // ON_CHAIN: BTC price threshold (8 dec). Others: unused.
        PolicyStatus status;
    }

    // --- State ---
    uint256 public nextPolicyId;
    mapping(uint256 => Policy) public policies;

    /// @notice Time offset for virtual clock. Single source of truth for all contracts.
    uint256 public timeOffset;

    // --- Events ---
    event PolicyRegistered(uint256 indexed policyId, string name, VerificationType verificationType);
    event PolicyActivated(uint256 indexed policyId, uint256 startTime);
    event TimeAdvanced(uint256 newTimestamp, uint256 secondsAdded);

    // --- Errors ---
    error PolicyRegistry__PolicyNotFound(uint256 policyId);
    error PolicyRegistry__InvalidStatus(uint256 policyId, PolicyStatus current, PolicyStatus expected);
    error PolicyRegistry__InvalidParams();

    constructor() Ownable(msg.sender) {}

    // --- Time Management ---

    /// @notice Returns virtual current time (block.timestamp + timeOffset).
    function currentTime() public view returns (uint256) {
        return block.timestamp + timeOffset;
    }

    /// @notice Advance the virtual clock. Only owner.
    /// @param secondsToAdd Number of seconds to advance
    function advanceTime(uint256 secondsToAdd) external onlyOwner {
        timeOffset += secondsToAdd;
        emit TimeAdvanced(currentTime(), secondsToAdd);
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
    ) external onlyOwner returns (uint256 policyId) {
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
    /// @param policyId The policy to activate
    function activatePolicy(uint256 policyId) external onlyOwner {
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
