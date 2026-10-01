// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title ClaimReceipt
/// @notice Soulbound (non-transferable) ERC-721 representing a claim draw-down right.
/// @dev Minted by authorized InsuranceVault contracts on claim trigger.
///      Burned on exercise. Receipt struct persists in storage after burn.
///
///      ADMIN AUTHORITY: OWNER_ROLE in ProtocolRoles, like every other module.
///      This contract previously used `Ownable(msg.sender)`, which left the
///      deploy key holding a protocol-wide claim kill-switch that governance
///      could neither exercise nor repair: `approveClaim` mints a receipt on
///      every path, so revoking the ClaimManager's authorization stops every
///      claim in every vault — and neither the timelock (not the owner) nor the
///      VaultFactory (registrar, add-only, and only for vaults it deploys) could
///      restore it. Routing admin through ProtocolRoles puts this contract
///      behind the same timelock as the rest of the protocol, with no separate
///      ownership-transfer step to forget.
contract ClaimReceipt is ERC721, ProtocolRoleConstants {
    // --- Structs ---
    struct Receipt {
        uint256 policyId;
        uint256 claimAmount;
        address vault;
        address insurer;
        uint256 timestamp;
        bool exercised;
    }

    // --- State ---
    /// @notice Central role manager; OWNER_ROLE here is the admin authority.
    ProtocolRoles public immutable protocolRoles;
    /// @notice Monotonic id of the next receipt.
    uint256 public nextReceiptId;
    /// @notice Receipt data by id.
    mapping(uint256 => Receipt) public receipts;
    /// @notice Vaults/managers allowed to mint receipts.
    mapping(address => bool) public authorizedMinters;
    /// @notice Address allowed to authorize new minters (cannot revoke existing ones).
    address public registrar; // Can add minters (but not revoke)

    // --- Events ---
    /// @notice Emitted when a claim receipt is minted at approval.
    event ReceiptMinted(
        uint256 indexed receiptId, address indexed insurer, uint256 policyId, uint256 claimAmount, address vault
    );
    /// @notice Emitted when a receipt is exercised (burned) at payout.
    event ReceiptExercised(uint256 indexed receiptId);
    /// @notice Emitted when a minter is authorized or de-authorized.
    event MinterUpdated(address indexed minter, bool authorized);
    /// @notice Emitted when the registrar is replaced.
    event RegistrarUpdated(address indexed registrar);

    // --- Errors ---
    /// @notice Caller is not an authorized minter.
    error ClaimReceipt__UnauthorizedMinter(address caller);
    /// @notice Receipts are soulbound: transfers are disabled.
    error ClaimReceipt__NonTransferable();
    /// @notice Receipt was already exercised.
    error ClaimReceipt__AlreadyExercised(uint256 receiptId);
    /// @notice No receipt under this id.
    error ClaimReceipt__ReceiptNotFound(uint256 receiptId);
    /// @notice Only the issuing vault may exercise the receipt.
    error ClaimReceipt__OnlyIssuingVault(uint256 receiptId, address caller, address vault);
    /// @notice Caller is not the registrar.
    error ClaimReceipt__UnauthorizedRegistrar(address caller);
    /// @notice Zero address passed where a contract is required.
    error ClaimReceipt__InvalidParams();

    /// @notice Deploys the soulbound ERC-721 under central role management.
    /// @param protocolRoles_ ProtocolRoles instance whose OWNER_ROLE administers
    ///        this contract (the governance timelock, once phase 1 has run).
    constructor(address protocolRoles_) ERC721("NextBlock Claim Receipt", "NXBCR") {
        if (protocolRoles_ == address(0)) revert ClaimReceipt__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
    }

    // --- Admin ---

    /// @notice Set or revoke minter authorization for a vault address.
    ///         OWNER_ROLE can add or revoke. Registrar can only add (not revoke).
    /// @param minter The vault address
    /// @param authorized Whether the vault is authorized to mint
    function setAuthorizedMinter(address minter, bool authorized) external {
        if (protocolRoles.hasRole(OWNER_ROLE, msg.sender)) {
            // Governance can add or revoke
            authorizedMinters[minter] = authorized;
        } else if (msg.sender == registrar && authorized) {
            // Registrar can only add, not revoke
            authorizedMinters[minter] = true;
        } else {
            revert ClaimReceipt__UnauthorizedRegistrar(msg.sender);
        }
        emit MinterUpdated(minter, authorized);
    }

    /// @notice Set the registrar address. Only OWNER_ROLE.
    /// @param registrar_ The new registrar (e.g., VaultFactory)
    function setRegistrar(address registrar_) external {
        if (!protocolRoles.hasRole(OWNER_ROLE, msg.sender)) {
            revert ClaimReceipt__UnauthorizedRegistrar(msg.sender);
        }
        registrar = registrar_;
        emit RegistrarUpdated(registrar_);
    }

    // --- Mint (only authorized vaults) ---

    /// @notice Mint a new claim receipt to the insurer.
    /// @param insurer The insurer address (recipient of payout)
    /// @param policyId The policy that triggered the claim
    /// @param claimAmount The amount the insurer can draw down (USDC 6 decimals)
    /// @param vault The vault that issued this receipt
    /// @return receiptId The ID of the newly minted receipt
    function mint(address insurer, uint256 policyId, uint256 claimAmount, address vault)
        external
        returns (uint256 receiptId)
    {
        if (!authorizedMinters[msg.sender]) {
            revert ClaimReceipt__UnauthorizedMinter(msg.sender);
        }

        receiptId = nextReceiptId++;

        receipts[receiptId] = Receipt({
            policyId: policyId,
            claimAmount: claimAmount,
            vault: vault,
            insurer: insurer,
            timestamp: block.timestamp,
            exercised: false
        });

        _mint(insurer, receiptId);

        emit ReceiptMinted(receiptId, insurer, policyId, claimAmount, vault);
    }

    // --- Mark Exercised (only the issuing vault) ---

    /// @notice Mark a receipt as exercised and burn the NFT. Belt-and-suspenders.
    /// @dev Only callable by the vault that issued this receipt (receipt.vault == msg.sender).
    /// @param receiptId The receipt to mark as exercised
    function markExercised(uint256 receiptId) external {
        Receipt storage receipt = receipts[receiptId];

        if (receipt.vault == address(0)) revert ClaimReceipt__ReceiptNotFound(receiptId);
        if (receipt.vault != msg.sender) {
            revert ClaimReceipt__OnlyIssuingVault(receiptId, msg.sender, receipt.vault);
        }
        if (receipt.exercised) revert ClaimReceipt__AlreadyExercised(receiptId);

        // SECURITY: Set exercised BEFORE burning (belt-and-suspenders)
        receipt.exercised = true;

        // Burn the NFT. Receipt struct persists in storage for querying.
        _burn(receiptId);

        emit ReceiptExercised(receiptId);
    }

    // --- Read ---

    /// @notice Get receipt data. Works even after burn (struct persists).
    /// @param receiptId The receipt to query
    /// @return The receipt struct
    function getReceipt(uint256 receiptId) external view returns (Receipt memory) {
        Receipt memory receipt = receipts[receiptId];
        if (receipt.vault == address(0)) revert ClaimReceipt__ReceiptNotFound(receiptId);
        return receipt;
    }

    // --- Soulbound: block transfers, allow mint + burn ---

    /// @dev Override _update to enforce soulbound (non-transferable).
    ///      Allows mint (from == address(0)) and burn (to == address(0)).
    ///      Reverts on any transfer where both from and to are non-zero.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert ClaimReceipt__NonTransferable();
        }
        return super._update(to, tokenId, auth);
    }
}
