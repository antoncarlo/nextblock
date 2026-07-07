// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title RedemptionQueue
/// @author Anton Carlo Santoro
/// @notice Periodic-window redemption queue for Institutional LP exits that
///         exceed an InsuranceVault's instant liquidity buffer.
///
///         MODEL (institutional / ILS-fund style, validated for NextBlock):
///         - Redemptions within the vault's free buffer stay instant on the
///           vault itself; this queue handles only the ABOVE-buffer remainder.
///         - LPs lodge a request with a notice period (epoch). At epoch close a
///           keeper settles whatever liquidity the vault can free, distributing
///           it PRO-RATA across all requests of that epoch. Pro-rata removes the
///           first-come bank-run dynamic: under scarcity everyone gets the same
///           fraction, settled at the NAV/share price observed at settlement.
///         - The unsettled remainder is returned to the LP as nbUSDC (they may
///           re-request in a later epoch); nothing is silently locked forever.
///
///         HARD BOUNDARIES:
///         - Holds NO business logic of the vault: it only calls the standard
///           ERC-4626 surface (maxRedeem / previewRedeem / redeem). The vault
///           remains the sole enforcer of buffer, UPR and solvency — a settle
///           can never redeem beyond `vault.maxRedeem(address(this))`.
///         - Custodies escrowed nbUSDC only because it is registered as an
///           approvedVenue in the ComplianceRegistry; it never bypasses KYC for
///           anyone else. Returned shares go only to the original (whitelisted)
///           requester.
///         - No value is created: escrowed shares + held USDC always reconcile
///           with outstanding requests and unclaimed settlements.
contract RedemptionQueue is ProtocolRoleConstants, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants ---
    /// @notice Basis-points denominator (100% = 10_000).
    uint256 public constant MAX_BPS = 10_000;
    /// @notice Notice-period bounds for the redemption window.
    uint64 public constant EPOCH_FLOOR = 1 hours;
    /// @notice Hard upper bound for the epoch duration.
    uint64 public constant EPOCH_CEILING = 90 days;

    // --- Immutables ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;
    /// @notice The vault whose above-buffer redemptions this queue serves.
    IERC4626 public immutable vault;
    /// @notice The vault's underlying settlement asset (USDC on Base).
    IERC20 public immutable asset;

    // --- Config ---
    /// @notice Notice period: minimum time a request waits before it can settle.
    uint64 public epochDuration;
    /// @notice True when the Sentinel has paused new requests/settlement.
    bool public paused;

    // --- Epoch state ---
    /// @notice Monotonic id of the epoch currently accepting requests.
    uint256 public currentEpochId;
    /// @notice Unix timestamp the current epoch opened.
    uint64 public currentEpochStart;

    struct Epoch {
        uint256 totalSharesRequested; // nbUSDC lodged in this epoch
        uint256 settledShares; // nbUSDC actually redeemed at settlement
        uint256 settledAssets; // USDC received for settledShares
        uint64 settledAt; // 0 until settled
        bool settled;
    }

    /// @notice epochId => epoch accounting.
    mapping(uint256 => Epoch) public epochs;
    /// @notice epochId => (lp => shares requested in that epoch).
    mapping(uint256 => mapping(address => uint256)) public sharesRequested;
    /// @notice epochId => (lp => already claimed).
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// @notice Total nbUSDC currently escrowed by the queue (accounting guard).
    uint256 public escrowedShares;

    // --- Events ---
    /// @notice Emitted when an LP escrows shares into the current epoch.
    event RedemptionRequested(uint256 indexed epochId, address indexed lp, uint256 shares);
    /// @notice Emitted when a matured epoch settles (pro-rata ratio recorded).
    event EpochSettled(uint256 indexed epochId, uint256 settledShares, uint256 settledAssets, uint256 ratioBps);
    /// @notice Emitted when an LP claims settled assets (plus unsettled shares back).
    event RedemptionClaimed(uint256 indexed epochId, address indexed lp, uint256 assetsPaid, uint256 sharesReturned);
    /// @notice Emitted when the epoch duration is reconfigured.
    event EpochDurationUpdated(uint64 oldDuration, uint64 newDuration);
    /// @notice Emitted when the Sentinel toggles the queue pause.
    event PausedSet(bool paused);

    // --- Errors ---
    /// @notice Requested shares must be non-zero.
    error RQ__ZeroShares();
    /// @notice Queue is paused.
    error RQ__QueuePaused();
    /// @notice Settlement attempted before epoch maturity.
    error RQ__EpochNotMatured(uint64 nowTs, uint64 maturesAt);
    /// @notice Epoch already settled.
    error RQ__AlreadySettled(uint256 epochId);
    /// @notice Claim attempted on an unsettled epoch.
    error RQ__NotSettled(uint256 epochId);
    /// @notice Caller has no request in this epoch.
    error RQ__NothingToClaim();
    /// @notice Epoch request already claimed.
    error RQ__AlreadyClaimed(uint256 epochId);
    /// @notice Epoch duration outside the allowed bounds.
    error RQ__BadEpochDuration(uint64 provided);
    /// @notice Caller lacks the required ProtocolRoles role.
    error RQ__Unauthorized(bytes32 role, address caller);

    modifier onlyRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) revert RQ__Unauthorized(role, msg.sender);
        _;
    }

    /// @notice Wires roles and the vault, and sets the (bounded) epoch duration.
    constructor(address protocolRoles_, address vault_, uint64 epochDuration_) {
        if (epochDuration_ < EPOCH_FLOOR || epochDuration_ > EPOCH_CEILING) {
            revert RQ__BadEpochDuration(epochDuration_);
        }
        protocolRoles = ProtocolRoles(protocolRoles_);
        vault = IERC4626(vault_);
        asset = IERC20(IERC4626(vault_).asset());
        epochDuration = epochDuration_;
        currentEpochStart = uint64(block.timestamp);
    }

    // --- LP: request -------------------------------------------------------

    /// @notice Lodge a redemption request for `shares` (nbUSDC) into the current
    ///         epoch. The shares are escrowed here until settlement. Caller must
    ///         have approved this queue for `shares` on the vault share token.
    function requestRedemption(uint256 shares) external nonReentrant returns (uint256 epochId) {
        if (paused) revert RQ__QueuePaused();
        if (shares == 0) revert RQ__ZeroShares();

        epochId = currentEpochId;
        // Pull escrow first (queue is an approvedVenue, so canReceive passes).
        IERC20(address(vault)).safeTransferFrom(msg.sender, address(this), shares);

        sharesRequested[epochId][msg.sender] += shares;
        epochs[epochId].totalSharesRequested += shares;
        escrowedShares += shares;

        emit RedemptionRequested(epochId, msg.sender, shares);
    }

    // --- Keeper: settle ----------------------------------------------------

    /// @notice Settle the current epoch once its notice period has elapsed.
    ///         Redeems whatever the vault can free now (capped at the vault's
    ///         own buffer via maxRedeem) and distributes it pro-rata. Advances
    ///         to a fresh epoch. Only ALLOCATOR_ROLE (keeper / Braino).
    /// @dev Protected by nonReentrant; the only external call is the trusted
    ///      protocol vault, and post-call writes merely open the next epoch.
    /// slither-disable-next-line reentrancy-no-eth
    function settleEpoch() external nonReentrant onlyRole(ALLOCATOR_ROLE) {
        if (paused) revert RQ__QueuePaused();
        uint256 epochId = currentEpochId;
        Epoch storage e = epochs[epochId];
        if (e.settled) revert RQ__AlreadySettled(epochId);

        uint64 maturesAt = currentEpochStart + epochDuration;
        if (uint64(block.timestamp) < maturesAt) {
            revert RQ__EpochNotMatured(uint64(block.timestamp), maturesAt);
        }

        uint256 requested = e.totalSharesRequested;
        uint256 settleShares = 0;
        uint256 settleAssets = 0;
        if (requested > 0) {
            // The vault is the final solvency authority: never redeem beyond
            // what its buffer permits right now.
            uint256 redeemable = vault.maxRedeem(address(this));
            settleShares = redeemable < requested ? redeemable : requested;
            if (settleShares > 0) {
                // Redeem to this queue; USDC custodied here for pro-rata claim.
                settleAssets = vault.redeem(settleShares, address(this), address(this));
                escrowedShares -= settleShares;
            }
        }

        e.settledShares = settleShares;
        e.settledAssets = settleAssets;
        e.settledAt = uint64(block.timestamp);
        e.settled = true;

        uint256 ratioBps = requested == 0 ? 0 : (settleShares * MAX_BPS) / requested;
        emit EpochSettled(epochId, settleShares, settleAssets, ratioBps);

        // Open the next epoch.
        currentEpochId = epochId + 1;
        currentEpochStart = uint64(block.timestamp);
    }

    // --- LP: claim ---------------------------------------------------------

    /// @notice Claim the pro-rata USDC for a settled epoch and receive back any
    ///         unsettled nbUSDC. Rounding favours the protocol (assets rounded
    ///         down to the LP); the residual shares are returned so no value is
    ///         stranded.
    function claim(uint256 epochId) external nonReentrant returns (uint256 assetsPaid, uint256 sharesReturned) {
        Epoch storage e = epochs[epochId];
        if (!e.settled) revert RQ__NotSettled(epochId);
        if (claimed[epochId][msg.sender]) revert RQ__AlreadyClaimed(epochId);

        uint256 userShares = sharesRequested[epochId][msg.sender];
        if (userShares == 0) revert RQ__NothingToClaim();

        claimed[epochId][msg.sender] = true;

        uint256 requested = e.totalSharesRequested;
        // Pro-rata settled shares for this LP (round down -> user not over-paid).
        // Two-step floor rounding is deliberate: the share quota is the escrow
        // unit of account; USDC conservation is invariant-tested (dust-safe).
        // slither-disable-next-line divide-before-multiply
        uint256 userSettledShares = (userShares * e.settledShares) / requested;
        sharesReturned = userShares - userSettledShares;

        if (e.settledShares > 0 && userSettledShares > 0) {
            // Pro-rata of the USDC actually received, by settled shares.
            // slither-disable-next-line divide-before-multiply
            assetsPaid = (userSettledShares * e.settledAssets) / e.settledShares;
            if (assetsPaid > 0) asset.safeTransfer(msg.sender, assetsPaid);
        }
        if (sharesReturned > 0) {
            // Absorb floor-rounding dust: integer pro-rata can over-allocate
            // sharesReturned by up to 1 wei per LP, so the last claimer would
            // otherwise revert on underflow. Cap to what's actually escrowed
            // for this epoch so the last LP eats the (sub-1e-12-USDC) dust.
            if (sharesReturned > escrowedShares) sharesReturned = escrowedShares;
            escrowedShares -= sharesReturned;
            IERC20(address(vault)).safeTransfer(msg.sender, sharesReturned);
        }

        emit RedemptionClaimed(epochId, msg.sender, assetsPaid, sharesReturned);
    }

    // --- Admin -------------------------------------------------------------

    /// @notice Update the notice period for future epochs. Only OWNER_ROLE.
    function setEpochDuration(uint64 newDuration) external onlyRole(OWNER_ROLE) {
        if (newDuration < EPOCH_FLOOR || newDuration > EPOCH_CEILING) {
            revert RQ__BadEpochDuration(newDuration);
        }
        emit EpochDurationUpdated(epochDuration, newDuration);
        epochDuration = newDuration;
    }

    /// @notice Emergency pause of new requests and settlement. Only SENTINEL_ROLE.
    ///         Claims of already-settled epochs remain available so LPs are never
    ///         trapped by a pause.
    function setPaused(bool paused_) external onlyRole(SENTINEL_ROLE) {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // --- Views -------------------------------------------------------------

    /// @notice Timestamp at which the current epoch can be settled.
    function currentEpochMaturesAt() external view returns (uint64) {
        return currentEpochStart + epochDuration;
    }

    /// @notice Preview the pro-rata outcome of a settled epoch for an LP.
    function previewClaim(uint256 epochId, address lp)
        external
        view
        returns (uint256 assetsPaid, uint256 sharesReturned)
    {
        Epoch storage e = epochs[epochId];
        uint256 userShares = sharesRequested[epochId][lp];
        if (!e.settled || userShares == 0 || claimed[epochId][lp]) return (0, 0);
        // Mirrors claim(): two-step floor rounding is the escrow unit of account.
        // slither-disable-next-line divide-before-multiply
        uint256 userSettledShares = (userShares * e.settledShares) / e.totalSharesRequested;
        sharesReturned = userShares - userSettledShares;
        if (e.settledShares > 0 && userSettledShares > 0) {
            // slither-disable-next-line divide-before-multiply
            assetsPaid = (userSettledShares * e.settledAssets) / e.settledShares;
        }
    }
}
