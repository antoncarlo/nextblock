// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";

/// @title SyndicateAssignmentTest
/// @author Anton Carlo Santoro
/// @notice A vault may be deployed with no syndicate and later assigned one by
///         governance. The property that matters is what CANNOT happen: an
///         incumbent syndicate is never displaced, and no unauthorised address
///         can take curation of a free vault.
contract SyndicateAssignmentTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimReceipt internal claimReceipt;
    MockUSDC internal usdc;
    MockOracle internal oracle;

    address internal admin = makeAddr("admin");
    address internal syndicateA = makeAddr("syndicateA");
    address internal syndicateB = makeAddr("syndicateB");
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(roles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolioRegistry = new PortfolioRegistry(address(roles));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), syndicateA);
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), syndicateB);
        vm.stopPrank();
    }

    function _vault(address manager) internal returns (InsuranceVault v) {
        vm.prank(admin);
        v = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Unassigned",
                symbol: "nbRV-FREE",
                vaultName: "Awaiting curation",
                owner: admin,
                vaultManager: manager,
                bufferRatioBps: 2000,
                managementFeeBps: 0,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
    }

    // --- The happy path: a free vault is taken into curation ---

    function test_freeVaultIsAwaitingCuration() public {
        InsuranceVault v = _vault(address(0));
        assertTrue(v.isAwaitingCuration(), "vault should start unassigned");
        assertEq(v.vaultManager(), address(0));
    }

    function test_ownerAssignsSyndicateToFreeVault() public {
        InsuranceVault v = _vault(address(0));

        vm.expectEmit(true, true, false, false, address(v));
        emit InsuranceVault.SyndicateAssigned(syndicateA, admin);

        vm.prank(admin);
        v.assignSyndicate(syndicateA);

        assertEq(v.vaultManager(), syndicateA, "syndicate bound");
        assertFalse(v.isAwaitingCuration(), "no longer awaiting");
    }

    // --- What must never happen ---

    function test_incumbentSyndicateCannotBeDisplaced() public {
        InsuranceVault v = _vault(syndicateA);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__AlreadyCurated.selector, syndicateA));
        v.assignSyndicate(syndicateB);
        assertEq(v.vaultManager(), syndicateA, "incumbent untouched");
    }

    function test_assignmentIsOneWayEvenForTheSameSyndicate() public {
        InsuranceVault v = _vault(address(0));
        vm.prank(admin);
        v.assignSyndicate(syndicateA);
        // A second call reverts regardless of the candidate: the slot is spent.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__AlreadyCurated.selector, syndicateA));
        v.assignSyndicate(syndicateA);
    }

    function test_nonOwnerCannotAssign() public {
        InsuranceVault v = _vault(address(0));
        // Not even a legitimate curator can appoint itself.
        vm.prank(syndicateA);
        vm.expectRevert();
        v.assignSyndicate(syndicateA);
        assertTrue(v.isAwaitingCuration(), "still free");
    }

    function test_candidateWithoutCuratorRoleRejected() public {
        InsuranceVault v = _vault(address(0));
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotACurator.selector, outsider));
        v.assignSyndicate(outsider);
    }

    function test_zeroAddressRejected() public {
        InsuranceVault v = _vault(address(0));
        vm.prank(admin);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        v.assignSyndicate(address(0));
    }

    // --- Curation powers follow the assignment ---

    function test_curatorPowersOnlyAfterAssignment() public {
        InsuranceVault v = _vault(address(0));

        // Before assignment nobody passes the manager gate, not even a curator.
        vm.prank(syndicateA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, syndicateA));
        v.addPolicy(1, 5_000);

        vm.prank(admin);
        v.assignSyndicate(syndicateA);

        // After assignment the gate opens for the appointed syndicate: the call
        // now travels past authorisation and dies in the policy registry, which
        // is precisely the proof that the manager check no longer blocks it.
        vm.prank(syndicateA);
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__PolicyNotFound.selector, uint256(1)));
        v.addPolicy(1, 5_000);

        // Another curator still cannot touch this vault.
        vm.prank(syndicateB);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, syndicateB));
        v.addPolicy(1, 5_000);
    }
}
