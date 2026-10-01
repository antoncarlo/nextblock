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
import {AIAssessor} from "../src/AIAssessor.sol";
import {ClaimManager} from "../src/ClaimManager.sol";

/// @title ClaimVaultBinding
/// @author Anton Carlo Santoro
/// @notice The claim path never binds a claim to the vault that underwrote the
///         portfolio. `ClaimManager.submitClaim` takes the paying vault as a
///         free argument from the cedant, and `InsuranceVault.payPortfolioClaim`
///         only checks the paying vault's own solvency — never that this vault
///         holds any allocation or premium for the portfolio being claimed.
///
///         Consequence: a cedant with a legitimate portfolio can name ANY vault
///         with a buffer and, on committee approval, drain the LPs of a vault
///         that never took on that risk. The protocol already knows how to bind
///         portfolio to vault — `PremiumDistributor.portfolioVault` does exactly
///         that, immutably, in the premium path — but the claim path ignores it.
///
///         This breaks the protocol's own stated invariant: "each vault backs
///         only its allocated portion." Here a vault backs a portion it was
///         never allocated at all.
///
///         Gate: committee approval (CLAIMS_COMMITTEE_ROLE). The finding is that
///         the contract delegates the vault-selection integrity entirely to an
///         off-chain committee eyeball, in a protocol whose whole posture is
///         on-chain enforcement over off-chain trust — and that on staging every
///         role sits on one deployer key, collapsing the only mitigant.
contract ClaimVaultBindingTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    AIAssessor internal assessor;
    ClaimManager internal claims;

    // Vault A: the vault that actually underwrote the cedant's portfolio.
    InsuranceVault internal underwritingVault;
    // Vault B: an unrelated vault whose LPs are the victims.
    InsuranceVault internal victimVault;

    address internal admin = makeAddr("admin");
    address internal curator = makeAddr("curator");
    address internal committee = makeAddr("committee");
    address internal oracleNode = makeAddr("oracleNode");
    address internal cedant = makeAddr("cedant");
    address internal lpVictim = makeAddr("lpVictim");
    address internal lpUnderwriter = makeAddr("lpUnderwriter");

    uint256 internal pid;

    uint256 internal constant COVERAGE = 500_000e6;
    uint256 internal constant VICTIM_BUFFER = 400_000e6;
    uint256 internal constant CLAIM = 300_000e6;
    uint256 internal constant PREMIUM = 20_000e6;
    bytes32 internal constant EVIDENCE = keccak256("loss");
    bytes32 internal constant AI_SOURCE = keccak256("assessment");

    function setUp() public {
        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt(address(roles));
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));
        assessor = new AIAssessor(address(roles));
        claims = new ClaimManager(address(roles), address(portfolios), address(assessor), address(receipts));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), admin);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);
        roles.grantRole(roles.CLAIMS_COMMITTEE_ROLE(), committee);
        roles.grantRole(roles.ORACLE_ROLE(), oracleNode);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), admin);

        compliance.setWhitelist(lpVictim, true);
        compliance.setKycExpiry(lpVictim, uint64(block.timestamp + 3650 days));

        underwritingVault = _vault("Underwriting", "nbUW");
        victimVault = _vault("Victim", "nbVIC");
        underwritingVault.setClaimManager(address(claims));
        victimVault.setClaimManager(address(claims));
        receipts.setAuthorizedMinter(address(claims), true);

        usdc.mint(lpVictim, VICTIM_BUFFER);
        vm.stopPrank();

        // The cedant's portfolio, ACTIVE. In a faithful deployment this is
        // underwritten by `underwritingVault`. `victimVault` has no relationship
        // to it whatsoever — no allocation, no premium.
        vm.prank(cedant);
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT",
                metadataURI: "ipfs://x",
                documentHash: keccak256("d"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 20_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.startPrank(admin);
        portfolios.startReview(pid);
        portfolios.approvePortfolio(pid, 6_500);
        portfolios.activatePortfolio(pid);
        vm.stopPrank();

        // Innocent LPs fund the VICTIM vault. Their capital is meant for the
        // victim vault's own book — nothing to do with the cedant's portfolio.
        vm.startPrank(lpVictim);
        usdc.approve(address(victimVault), VICTIM_BUFFER);
        victimVault.deposit(VICTIM_BUFFER, lpVictim);
        vm.stopPrank();
    }

    /// @notice REGRESSION: the claim is refused at submission, before a committee
    ///         ever sees it.
    /// @dev The gate is `InsuranceVault.underwrites`, a sticky flag raised when
    ///      the vault commits capital to a portfolio or takes premium for it.
    ///      Sticky matters: `portfolioAllocation` legitimately falls back to zero
    ///      (a claim reserve absorbs it, the allocator unwinds it) while the vault
    ///      is still on risk for losses that occurred during cover — so the
    ///      allocation balance is the wrong thing to gate on.
    function test_cedantCannotClaimAgainstAVaultThatNeverUnderwroteThePortfolio() public {
        // Precondition: the victim vault has ZERO relationship to the portfolio.
        assertEq(victimVault.portfolioAllocation(pid), 0, "victim vault never allocated to this portfolio");
        assertFalse(victimVault.underwrites(pid), "and is not on risk for it");
        assertEq(usdc.balanceOf(address(victimVault)), VICTIM_BUFFER, "victim holds only its own LPs' capital");

        // Naming it is refused outright. No committee judgement is involved, which
        // is the point: vault selection is enforced on-chain, not eyeballed.
        vm.prank(cedant);
        vm.expectRevert(
            abi.encodeWithSelector(
                ClaimManager.ClaimManager__VaultDoesNotUnderwrite.selector, address(victimVault), pid
            )
        );
        claims.submitClaim(address(victimVault), pid, CLAIM, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);

        assertEq(usdc.balanceOf(address(victimVault)), VICTIM_BUFFER, "innocent LP capital untouched");
        assertEq(usdc.balanceOf(cedant), 0, "cedant got nothing");
    }

    /// @notice CONTROL: the same claim settles against the vault that DID take
    ///         the risk.
    /// @dev Without this, the fix could be a blanket refusal that merely looks
    ///      safe. The legitimate path has to keep working.
    function test_controlClaimSettlesAgainstTheUnderwritingVault() public {
        // Premium is one of the two ways a vault goes on risk for a portfolio.
        vm.startPrank(admin);
        roles.grantRole(roles.PREMIUM_DEPOSITOR_ROLE(), admin);
        usdc.mint(admin, PREMIUM);
        usdc.approve(address(underwritingVault), PREMIUM);
        underwritingVault.recordPortfolioPremium(pid, PREMIUM);

        // ...and it needs LP capital to pay from.
        usdc.mint(lpUnderwriter, VICTIM_BUFFER);
        compliance.setWhitelist(lpUnderwriter, true);
        compliance.setKycExpiry(lpUnderwriter, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        assertTrue(underwritingVault.underwrites(pid), "premium put this vault on risk");

        vm.startPrank(lpUnderwriter);
        usdc.approve(address(underwritingVault), VICTIM_BUFFER);
        underwritingVault.deposit(VICTIM_BUFFER, lpUnderwriter);
        vm.stopPrank();

        vm.prank(cedant);
        uint256 claimId =
            claims.submitClaim(address(underwritingVault), pid, CLAIM, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);

        vm.prank(oracleNode);
        assessor.publishAssessment(claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, CLAIM, AI_SOURCE);
        claims.attachAssessment(claimId);
        vm.warp(block.timestamp + claims.disputeWindow() + 1);

        vm.prank(committee);
        claims.approveClaim(claimId, CLAIM);
        claims.executeClaim(claimId);

        assertEq(usdc.balanceOf(cedant), CLAIM, "the cedant is paid by the vault that took the risk");
    }

    function _vault(string memory name, string memory symbol) internal returns (InsuranceVault v) {
        v = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: name,
                symbol: symbol,
                vaultName: name,
                owner: admin,
                vaultManager: curator,
                bufferRatioBps: 2_000,
                managementFeeBps: 0,
                registry: address(policies),
                oracle: address(oracle),
                claimReceipt: address(receipts),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolios)
            })
        );
    }
}
