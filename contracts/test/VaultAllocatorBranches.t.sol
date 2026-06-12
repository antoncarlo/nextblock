// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";

/// @title VaultAllocatorBranchesTest
/// @author Anton Carlo Santoro
/// @notice Targeted branch coverage for allocator guard paths: constructor
///         params, proposal TTL bounds, zero-param proposals, split input
///         validation and the proposal lifecycle error states.
contract VaultAllocatorBranchesTest is Test {
    ProtocolRoles public protocolRoles;
    PortfolioRegistry public portfolioRegistry;
    NavOracle public navOracle;
    VaultAllocator public vaultAllocator;

    address public admin = makeAddr("admin");
    address public allocator = makeAddr("allocator");
    address public attacker = makeAddr("attacker");
    address public vaultAddr = makeAddr("vaultA");

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        navOracle = new NavOracle(address(protocolRoles), address(portfolioRegistry));
        vaultAllocator = new VaultAllocator(address(protocolRoles), address(portfolioRegistry), address(navOracle));
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocator);
        vm.stopPrank();
    }

    /// @dev Deallocation proposals skip oracle/concentration guards, so they
    ///      are the lightest way to mint a PROPOSED entry for lifecycle tests.
    function _pendingProposal() internal returns (uint256 proposalId) {
        vm.prank(allocator);
        proposalId = vaultAllocator.proposeDeallocation(vaultAddr, 1, 1_000e6);
    }

    // --- Constructor ---

    function test_constructor_revertsOnZeroRoles() public {
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        new VaultAllocator(address(0), address(portfolioRegistry), address(navOracle));
    }

    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        new VaultAllocator(address(protocolRoles), address(0), address(navOracle));
    }

    // --- Proposal TTL ---

    function test_setProposalTtl_revertsBelowFloor() public {
        uint64 floor_ = vaultAllocator.PROPOSAL_TTL_FLOOR();
        vm.prank(admin);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.setProposalTtl(floor_ - 1);
    }

    function test_setProposalTtl_revertsAboveCeiling() public {
        uint64 ceiling = vaultAllocator.PROPOSAL_TTL_CEILING();
        vm.prank(admin);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.setProposalTtl(ceiling + 1);
    }

    function test_setProposalTtl_updatesWithinBounds() public {
        vm.prank(admin);
        vaultAllocator.setProposalTtl(2 hours);
        assertEq(vaultAllocator.proposalTtl(), 2 hours);
    }

    function test_setProposalTtl_revertsForNonOwner() public {
        // Hoisted: an external call in the argument list would consume the prank.
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(VaultAllocator.VaultAllocator__UnauthorizedRole.selector, attacker, ownerRole)
        );
        vaultAllocator.setProposalTtl(2 hours);
    }

    // --- Proposal parameter guards ---

    function test_proposeAllocation_revertsOnZeroVault() public {
        vm.prank(allocator);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeAllocation(address(0), 1, 1_000e6);
    }

    function test_proposeAllocation_revertsOnZeroAmount() public {
        vm.prank(allocator);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeAllocation(vaultAddr, 1, 0);
    }

    function test_proposeDeallocation_revertsOnZeroVault() public {
        vm.prank(allocator);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeDeallocation(address(0), 1, 1_000e6);
    }

    function test_proposeDeallocation_revertsOnZeroAmount() public {
        vm.prank(allocator);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeDeallocation(vaultAddr, 1, 0);
    }

    function test_proposeSplitAllocation_revertsOnBadInputs() public {
        uint256[] memory empty = new uint256[](0);
        uint256[] memory one = new uint256[](1);
        one[0] = 10_000;

        vm.startPrank(allocator);
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeSplitAllocation(vaultAddr, empty, empty, 1_000e6);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeSplitAllocation(vaultAddr, ids, empty, 1_000e6);

        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeSplitAllocation(vaultAddr, ids, one, 0);

        uint256[] memory zeroWeight = new uint256[](1);
        zeroWeight[0] = 0;
        vm.expectRevert(VaultAllocator.VaultAllocator__InvalidParams.selector);
        vaultAllocator.proposeSplitAllocation(vaultAddr, ids, zeroWeight, 1_000e6);
        vm.stopPrank();
    }

    // --- Proposal lifecycle error states ---

    function test_getProposal_revertsWhenNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(VaultAllocator.VaultAllocator__ProposalNotFound.selector, 999));
        vaultAllocator.getProposal(999);
    }

    function test_cancelProposal_revertsWhenNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(VaultAllocator.VaultAllocator__ProposalNotFound.selector, 999));
        vaultAllocator.cancelProposal(999);
    }

    function test_cancelProposal_revertsWhenAlreadyCancelled() public {
        uint256 proposalId = _pendingProposal();
        vm.prank(allocator);
        vaultAllocator.cancelProposal(proposalId);

        vm.prank(allocator);
        vm.expectRevert(
            abi.encodeWithSelector(
                VaultAllocator.VaultAllocator__ProposalNotPending.selector,
                proposalId,
                VaultAllocator.ProposalStatus.CANCELLED
            )
        );
        vaultAllocator.cancelProposal(proposalId);
    }

    function test_markExpired_revertsWhenNotPending() public {
        uint256 proposalId = _pendingProposal();
        vm.prank(allocator);
        vaultAllocator.cancelProposal(proposalId);

        vm.expectRevert(
            abi.encodeWithSelector(
                VaultAllocator.VaultAllocator__ProposalNotPending.selector,
                proposalId,
                VaultAllocator.ProposalStatus.CANCELLED
            )
        );
        vaultAllocator.markExpired(proposalId);
    }

    function test_markExpired_revertsBeforeTtl() public {
        uint256 proposalId = _pendingProposal();
        VaultAllocator.AllocationProposal memory p = vaultAllocator.getProposal(proposalId);
        vm.expectRevert(
            abi.encodeWithSelector(VaultAllocator.VaultAllocator__ProposalNotExpired.selector, proposalId, p.expiresAt)
        );
        vaultAllocator.markExpired(proposalId);
    }

    function test_markExpired_succeedsAfterTtl() public {
        uint256 proposalId = _pendingProposal();
        VaultAllocator.AllocationProposal memory p = vaultAllocator.getProposal(proposalId);
        vm.warp(uint256(p.expiresAt) + 1);
        vaultAllocator.markExpired(proposalId);
        assertEq(uint8(vaultAllocator.getProposal(proposalId).status), uint8(VaultAllocator.ProposalStatus.EXPIRED));
    }
}
