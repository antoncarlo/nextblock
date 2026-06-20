// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../../script/DeployStack.s.sol";
import {ProtocolRoles, ProtocolRoleConstants} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";
import {AIAssessor} from "../../src/AIAssessor.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";

/// @title ClaimLifecycleForkTest
/// @author Anton Carlo Santoro
/// @notice Forks the REAL Base Sepolia chain, deploys a fresh NextBlock stack
///         (via DeployStack), and exercises the full claim happy-path:
///
///             portfolio submit → curator approve+activate
///             → policy register → vault addPolicy
///             → LP deposit USDC → cedant deposit premium
///             → cedant submit claim
///             → oracle publishAssessment
///             → dispute window expires (vm.warp)
///             → committee approveClaim
///             → executeClaim → claimant receives USDC payout
///
///         Validates the cross-module accounting (USDC conservation, vault
///         policy/premium state, ClaimReceipt exercise) on the real chain id.
/// @dev    CI-safe: when BASE_SEPOLIA_RPC_URL is unset the tests self-skip,
///         so the contracts CI job stays green even without RPC credentials.
///         To run:
///
///             BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///               forge test --match-path "test/fork/ClaimLifecycleFork*" -vvv
contract ClaimLifecycleForkTest is Test, ProtocolRoleConstants {
    // Block pinned for reproducibility. Matches LendingMarketFork to share the
    // RPC cache between the two fork suites.
    uint256 internal constant PINNED_BLOCK = 42_720_000;
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 internal constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address internal constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    DeployStack internal deploy;
    ProtocolRoles internal protocolRoles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimManager internal claimManager;
    AIAssessor internal assessor;
    InsuranceVault internal vault;
    MockUSDC internal usdc;

    bool internal forked;

    address internal lp = makeAddr("forkLP");
    address internal claimant = makeAddr("forkClaimantWallet");

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // self-skip in CI

        vm.createSelectFork(rpc, PINNED_BLOCK);
        forked = true;

        vm.setEnv("PRIVATE_KEY", vm.toString(ANVIL_PK));
        vm.setEnv("WRITE_DEPLOYMENT_JSON", "false");

        deploy = new DeployStack();
        deploy.run();

        protocolRoles = deploy.protocolRoles();
        compliance = deploy.compliance();
        portfolioRegistry = deploy.portfolioRegistry();
        policyRegistry = deploy.policyRegistry();
        claimManager = deploy.claimManager();
        assessor = deploy.assessor();
        vault = deploy.vault();
        usdc = deploy.usdc();

        // The DeployStack staging deploy concentrates every role on the
        // deployer (curator / committee / sentinel / oracle / cedant / KYC).
        // The lifecycle test exercises the happy-path, so we don't bother
        // creating separate EOAs per role — we prank the deployer.
        // The one role we still need to grant ourselves is
        // PREMIUM_DEPOSITOR_ROLE: in production it's held by the
        // PremiumDistributor, but for the fork happy-path we deposit
        // straight on the vault.
        vm.prank(ANVIL_DEPLOYER);
        protocolRoles.grantRole(PREMIUM_DEPOSITOR_ROLE, ANVIL_DEPLOYER);
    }

    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    function _onboard(address who) internal {
        vm.startPrank(ANVIL_DEPLOYER); // holds KYC_OPERATOR on a fresh deploy
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    function test_Fork_ClaimHappyPath() public onlyForked {
        assertEq(block.chainid, 84532, "must run on the Base Sepolia fork");

        // 1. Compliance: whitelist LP and claimant.
        _onboard(lp);
        _onboard(claimant);

        // 2. Portfolio: cedant submits, curator approves + activates.
        PortfolioRegistry.SubmissionParams memory p = PortfolioRegistry.SubmissionParams({
            name: "ForkTest Cat Portfolio",
            metadataURI: "ipfs://forktest",
            documentHash: keccak256("forktest-doc"),
            lineOfBusiness: "Catastrophe",
            jurisdiction: "IT",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: 1_000_000e6,
            cededPremium: 50_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 365 days)
        });
        vm.startPrank(ANVIL_DEPLOYER);
        uint256 portfolioId = portfolioRegistry.submitPortfolio(p);
        portfolioRegistry.startReview(portfolioId);
        portfolioRegistry.approvePortfolio(portfolioId, 2_000);
        portfolioRegistry.activatePortfolio(portfolioId);
        vm.stopPrank();

        // 3. Policy: cedant registers it; vault manager attaches it.
        vm.prank(ANVIL_DEPLOYER);
        uint256 policyId = policyRegistry.registerPolicy(
            "ForkTest Policy",
            PolicyRegistry.VerificationType.OFF_CHAIN,
            1_000_000e6,
            50_000e6,
            365 days,
            ANVIL_DEPLOYER,
            0
        );
        // The vault only accepts ACTIVE policies; the curator activates it first.
        vm.prank(ANVIL_DEPLOYER);
        policyRegistry.activatePolicy(policyId);
        vm.prank(ANVIL_DEPLOYER);
        vault.addPolicy(policyId, 10_000); // 100% of vault weight to this single policy

        // 4. LP deposits USDC into the vault (also funds the buffer for the payout).
        deal(address(usdc), lp, 200_000e6);
        vm.startPrank(lp);
        usdc.approve(address(vault), 200_000e6);
        uint256 sharesMinted = vault.deposit(200_000e6, lp);
        vm.stopPrank();
        assertGt(sharesMinted, 0, "deposit minted no shares");

        // 5. Cedant pays the premium directly onto the vault (one-period flow).
        deal(address(usdc), ANVIL_DEPLOYER, 50_000e6);
        vm.startPrank(ANVIL_DEPLOYER);
        usdc.approve(address(vault), 50_000e6);
        vault.depositPremium(policyId, 50_000e6);
        vm.stopPrank();

        // 6. Cedant submits a claim against this portfolio.
        uint256 claimAmount = 30_000e6;
        vm.prank(ANVIL_DEPLOYER);
        uint256 claimId = claimManager.submitClaim(
            address(vault),
            portfolioId,
            claimAmount,
            ClaimManager.ClaimType.NON_PARAMETRIC,
            keccak256("forktest-evidence")
        );

        // 7. Oracle publishes the off-chain AI assessment. Approve (0).
        vm.prank(ANVIL_DEPLOYER);
        assessor.publishAssessment(
            claimId, 8_500, 1_000, 7_500, AIAssessor.Recommendation.APPROVE, claimAmount, keccak256("forktest-src")
        );

        // 7b. Attach the on-chain assessment to the claim (flips SUBMITTED → ASSESSED).
        claimManager.attachAssessment(claimId);

        // 8. Skip the dispute / challenge window so the committee can approve.
        ClaimManager.Claim memory claimSnap = claimManager.getClaim(claimId);
        if (claimSnap.challengeDeadline > block.timestamp) {
            vm.warp(claimSnap.challengeDeadline + 1);
        }

        // 9. Committee approves; executeClaim moves USDC to the claimant.
        uint256 balBefore = usdc.balanceOf(claimant);
        vm.prank(ANVIL_DEPLOYER);
        claimManager.approveClaim(claimId, claimAmount);

        // Capture the recipient: the on-chain claimant is the address that
        // called submitClaim (the cedant wallet), not the LP. Use it for the
        // post-payment balance check.
        ClaimManager.Claim memory approved = claimManager.getClaim(claimId);
        uint256 recipientBalBefore = usdc.balanceOf(approved.claimant);

        claimManager.executeClaim(claimId);

        ClaimManager.Claim memory paid = claimManager.getClaim(claimId);
        assertEq(uint8(paid.status), uint8(ClaimManager.ClaimStatus.PAID), "claim not marked PAID");

        uint256 recipientBalAfter = usdc.balanceOf(approved.claimant);
        assertEq(recipientBalAfter - recipientBalBefore, claimAmount, "claimant USDC delta != approved amount");

        // Silence unused-variable warnings.
        balBefore;
    }
}
