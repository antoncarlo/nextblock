// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract ClaimReceiptTest is Test {
    ClaimReceipt public cr;
    address public admin = makeAddr("admin");
    address public vault = makeAddr("vault");
    address public vault2 = makeAddr("vault2");
    address public insurer = makeAddr("insurer");
    address public notAuthorized = makeAddr("notAuthorized");

    function setUp() public {
        vm.prank(admin);
        cr = new ClaimReceipt();

        // Authorize vault as minter
        vm.prank(admin);
        cr.setAuthorizedMinter(vault, true);
    }

    // --- Minter Authorization ---

    function test_setAuthorizedMinter() public {
        assertTrue(cr.authorizedMinters(vault));
    }

    function test_setAuthorizedMinter_revoke() public {
        vm.prank(admin);
        cr.setAuthorizedMinter(vault, false);
        assertFalse(cr.authorizedMinters(vault));
    }

    function test_setAuthorizedMinter_onlyOwnerOrRegistrar() public {
        // Non-owner, non-registrar cannot add minters
        vm.prank(notAuthorized);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedRegistrar.selector, notAuthorized));
        cr.setAuthorizedMinter(vault2, true);
    }

    // --- Mint ---

    function test_mint() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        assertEq(receiptId, 0);
        assertEq(cr.ownerOf(0), insurer);
        assertEq(cr.nextReceiptId(), 1);
    }

    function test_mint_receiptData() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        ClaimReceipt.Receipt memory receipt = cr.getReceipt(receiptId);
        assertEq(receipt.policyId, 1);
        assertEq(receipt.claimAmount, 50_000e6);
        assertEq(receipt.vault, vault);
        assertEq(receipt.insurer, insurer);
        assertGt(receipt.timestamp, 0);
        assertFalse(receipt.exercised);
    }

    function test_mint_incrementsId() public {
        vm.startPrank(vault);
        uint256 id0 = cr.mint(insurer, 0, 50_000e6, vault);
        uint256 id1 = cr.mint(insurer, 1, 15_000e6, vault);
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    function test_mint_unauthorizedReverts() public {
        vm.prank(notAuthorized);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedMinter.selector, notAuthorized));
        cr.mint(insurer, 1, 50_000e6, vault);
    }

    // --- Soulbound ---

    function test_soulbound_transferBlocked() public {
        vm.prank(vault);
        cr.mint(insurer, 1, 50_000e6, vault);

        vm.prank(insurer);
        vm.expectRevert(ClaimReceipt.ClaimReceipt__NonTransferable.selector);
        cr.transferFrom(insurer, makeAddr("other"), 0);
    }

    function test_soulbound_safeTransferBlocked() public {
        vm.prank(vault);
        cr.mint(insurer, 1, 50_000e6, vault);

        vm.prank(insurer);
        vm.expectRevert(ClaimReceipt.ClaimReceipt__NonTransferable.selector);
        cr.safeTransferFrom(insurer, makeAddr("other"), 0);
    }

    function test_soulbound_mintAllowed() public {
        vm.prank(vault);
        cr.mint(insurer, 1, 50_000e6, vault);
        // Should not revert -- mint is allowed
        assertEq(cr.ownerOf(0), insurer);
    }

    // --- Mark Exercised ---

    function test_markExercised() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        vm.prank(vault);
        cr.markExercised(receiptId);

        ClaimReceipt.Receipt memory receipt = cr.getReceipt(receiptId);
        assertTrue(receipt.exercised);

        // NFT is burned
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, receiptId));
        cr.ownerOf(receiptId);
    }

    function test_markExercised_onlyIssuingVault() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        // Another address tries to markExercised
        vm.prank(notAuthorized);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimReceipt.ClaimReceipt__OnlyIssuingVault.selector,
            receiptId, notAuthorized, vault
        ));
        cr.markExercised(receiptId);
    }

    function test_markExercised_doubleExerciseReverts() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        vm.prank(vault);
        cr.markExercised(receiptId);

        // Second call should revert
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__AlreadyExercised.selector, receiptId));
        cr.markExercised(receiptId);
    }

    function test_markExercised_notFound() public {
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__ReceiptNotFound.selector, 999));
        cr.markExercised(999);
    }

    // --- Get Receipt ---

    function test_getReceipt_afterBurn() public {
        vm.prank(vault);
        uint256 receiptId = cr.mint(insurer, 1, 50_000e6, vault);

        vm.prank(vault);
        cr.markExercised(receiptId);

        // Receipt struct should still be queryable (mapping persists)
        ClaimReceipt.Receipt memory receipt = cr.getReceipt(receiptId);
        assertTrue(receipt.exercised);
        assertEq(receipt.claimAmount, 50_000e6);
    }

    function test_getReceipt_notFound() public {
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__ReceiptNotFound.selector, 999));
        cr.getReceipt(999);
    }
}
