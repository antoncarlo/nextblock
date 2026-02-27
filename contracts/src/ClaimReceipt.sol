// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ClaimReceipt
/// @notice Soulbound (non-transferable) ERC-721 representing a claim draw-down right.
/// @dev Minted by authorized InsuranceVault contracts on claim trigger.
///      Burned on exercise. Receipt struct persists in storage after burn.
contract ClaimReceipt is ERC721, Ownable {
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
    uint256 public nextReceiptId;
    mapping(uint256 => Receipt) public receipts;
    mapping(address => bool) public authorizedMinters;
    address public registrar; // Can add minters (but not revoke)

    // --- Events ---
    event ReceiptMinted(uint256 indexed receiptId, address indexed insurer, uint256 policyId, uint256 claimAmount, address vault);
    event ReceiptExercised(uint256 indexed receiptId);
    event MinterUpdated(address indexed minter, bool authorized);
    event RegistrarUpdated(address indexed registrar);

    // --- Errors ---
    error ClaimReceipt__UnauthorizedMinter(address caller);
    error ClaimReceipt__NonTransferable();
    error ClaimReceipt__AlreadyExercised(uint256 receiptId);
    error ClaimReceipt__ReceiptNotFound(uint256 receiptId);
    error ClaimReceipt__OnlyIssuingVault(uint256 receiptId, address caller, address vault);
    error ClaimReceipt__UnauthorizedRegistrar(address caller);

    constructor() ERC721("NextBlock Claim Receipt", "NXBCR") Ownable(msg.sender) {}

    // --- Admin ---

    /// @notice Set or revoke minter authorization for a vault address.
    ///         Owner can add or revoke. Registrar can only add (not revoke).
    /// @param minter The vault address
    /// @param authorized Whether the vault is authorized to mint
    function setAuthorizedMinter(address minter, bool authorized) external {
        if (msg.sender == owner()) {
            // Owner can add or revoke
            authorizedMinters[minter] = authorized;
        } else if (msg.sender == registrar && authorized) {
            // Registrar can only add, not revoke
            authorizedMinters[minter] = true;
        } else {
            revert ClaimReceipt__UnauthorizedRegistrar(msg.sender);
        }
        emit MinterUpdated(minter, authorized);
    }

    /// @notice Set the registrar address. Only owner.
    /// @param registrar_ The new registrar (e.g., VaultFactory)
    function setRegistrar(address registrar_) external onlyOwner {
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
    function mint(
        address insurer,
        uint256 policyId,
        uint256 claimAmount,
        address vault
    ) external returns (uint256 receiptId) {
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
