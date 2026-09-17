// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {AIAssessor} from "../src/AIAssessor.sol";

/// @title FactoryVaultClaimGap
/// @author Anton Carlo Santoro
/// @notice REGRESSION (F-09): a vault born from the factory can pay a claim.
///
///         `VaultFactory._create` used to deploy the vault, register it as a
///         ClaimReceipt minter, and stop. It never called `setClaimManager`, so
///         the new vault's `claimManager` stayed at `address(0)` and the
///         `onlyClaimManager` gate admitted nobody — `msg.sender` is never the
///         zero address. Repair needed the global `OWNER_ROLE`, which the curator
///         who created the vault does not hold, so the gap was a separate
///         governance action that nothing enforced and no view surfaced.
///
///         Meanwhile the vault was fully open for business: LP deposits, premium,
///         portfolio allocation. For an insurance protocol that is the worst
///         reachable state — capital collected against cover that cannot be paid,
///         with the cedant's protection illusory until somebody noticed. It was
///         live on Base Sepolia on 2 of 3 factory vaults, holding 35,970 USDC.
///
///         The factory now binds the ClaimManager inside `_create`, using
///         VAULT_FACTORY_ROLE, which `setClaimManager` accepts only while the slot
///         is empty. Bind-once: the factory can bootstrap a vault but can never
///         displace a manager governance has already chosen.
contract FactoryVaultClaimGapTest is Test {
    /// @dev Anvil default key #0 — publicly known testnet placeholder.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    VaultFactory factory;
    ProtocolRoles roles;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolios;
    MockUSDC usdc;
    ClaimManager claims;
    AIAssessor assessor;
    address deployer;

    InsuranceVault newVault;

    address curator = makeAddr("curator");
    address lp = makeAddr("lp");
    address cedant = makeAddr("cedant");
    address committee = makeAddr("committee");
    address oracleNode = makeAddr("oracleNode");

    uint256 constant DEPOSIT = 200_000e6;
    uint256 constant COVERAGE = 150_000e6;
    uint256 constant CLAIM = 50_000e6;
    uint256 constant PREMIUM = 15_000e6;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        factory = deploy.factory();
        roles = deploy.protocolRoles();
        compliance = deploy.compliance();
        portfolios = deploy.portfolioRegistry();
        usdc = deploy.usdc();
        claims = deploy.claimManager();
        assessor = deploy.assessor();
        deployer = deploy.deployer();

        vm.startPrank(deployer);
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);
        roles.grantRole(roles.CLAIMS_COMMITTEE_ROLE(), committee);
        roles.grantRole(roles.ORACLE_ROLE(), oracleNode);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        // A curator stands up a new vault through the sanctioned path.
        vm.prank(curator);
        newVault = InsuranceVault(factory.createVault("Syndicate Two", "nbS2", "Syndicate Two", curator, 2_000, 0));
    }

    /// @notice A vault created through the sanctioned path settles a claim end to end.
    function test_factoryVaultIsBornAbleToPayClaims() public {
        // Born WITH a claim path, before it can take a single deposit.
        assertEq(newVault.claimManager(), address(claims), "factory wires the claim manager at creation");

        // LP capital goes in.
        deal(address(usdc), lp, DEPOSIT);
        vm.startPrank(lp);
        usdc.approve(address(newVault), DEPOSIT);
        newVault.deposit(DEPOSIT, lp);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(newVault)), DEPOSIT, "the vault holds real LP capital");

        // A cedant's portfolio, on risk.
        vm.prank(cedant);
        uint256 pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Marine XL",
                metadataURI: "ipfs://x",
                documentHash: keccak256("d"),
                lineOfBusiness: "Marine",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 15_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.startPrank(deployer);
        portfolios.startReview(pid);
        portfolios.approvePortfolio(pid, 6_500);
        portfolios.activatePortfolio(pid);
        // Premium puts this vault on risk for the portfolio, satisfying the F-07
        // claim-vault binding.
        roles.grantRole(roles.PREMIUM_DEPOSITOR_ROLE(), deployer);
        deal(address(usdc), deployer, PREMIUM);
        usdc.approve(address(newVault), PREMIUM);
        newVault.recordPortfolioPremium(pid, PREMIUM);
        vm.stopPrank();

        // A loss occurs and the claim runs the full, correct governance path.
        vm.prank(cedant);
        uint256 claimId =
            claims.submitClaim(address(newVault), pid, CLAIM, ClaimManager.ClaimType.NON_PARAMETRIC, keccak256("loss"));

        vm.prank(oracleNode);
        assessor.publishAssessment(
            claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, CLAIM, keccak256("ai")
        );
        claims.attachAssessment(claimId);
        vm.warp(block.timestamp + claims.disputeWindow() + 1);

        // The committee approves and the vault settles — no separate governance
        // action, no stranded capital.
        vm.prank(committee);
        claims.approveClaim(claimId, CLAIM);
        claims.executeClaim(claimId);

        assertEq(usdc.balanceOf(cedant), CLAIM, "the cedant is paid by a vault the factory created");
    }

    /// @notice The factory can bootstrap an empty slot, never displace a choice.
    /// @dev The bind-once half of the fix. VAULT_FACTORY_ROLE is real authority,
    ///      so it has to be bounded: once governance has named a ClaimManager, the
    ///      factory role must not be able to point the vault somewhere else.
    function test_factoryRoleCannotRebindAnAlreadyBoundClaimManager() public {
        address factoryAddr = address(factory);
        assertEq(newVault.claimManager(), address(claims), "slot is taken");

        vm.prank(factoryAddr);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, factoryAddr));
        newVault.setClaimManager(address(0xBAD));

        // Governance, on the other hand, may rebind at will.
        vm.prank(deployer); // holds OWNER_ROLE
        newVault.setClaimManager(address(0xBEEF));
        assertEq(newVault.claimManager(), address(0xBEEF), "OWNER_ROLE can rebind");
    }
}
