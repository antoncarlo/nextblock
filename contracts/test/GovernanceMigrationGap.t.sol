// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {GovernanceMigration} from "../script/GovernanceMigration.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title GovernanceMigrationGap
/// @author Anton Carlo Santoro
/// @notice What survives `GovernanceMigration`, and what no longer does.
///
///         The script moves exactly two roles on exactly one contract:
///         OWNER_ROLE and DEFAULT_ADMIN_ROLE on ProtocolRoles. It then prints
///         "Governance now flows exclusively through ProtocolTimelock".
///
///         FIXED (F-08): `ClaimReceipt` used to be `Ownable(msg.sender)`, outside
///         the governance model entirely. Its owner held a protocol-wide claim
///         kill-switch — `approveClaim` mints a receipt on every path, so
///         revoking the ClaimManager's authorisation stopped every claim in every
///         vault — which the timelock could neither exercise nor repair. It is
///         now gated on ProtocolRoles.OWNER_ROLE, so the grant the timelock
///         already holds covers it, with no separate migration step to forget.
///         The first two tests are that regression guard, in both directions.
///
///         STILL OPEN (F-10): phase 2 enforces none of its documented
///         preconditions. `docs/GOVERNANCE_PHASE2.md` Stage A — move the
///         operational roles off the deploy key — is prose, not code, and the
///         script neither performs nor verifies it. The last two tests document
///         that. The drain still completes: the claim-vault binding added for
///         F-07 only forces the retired key to route through an allocation it is
///         still authorised to make.
contract GovernanceMigrationGapTest is Test {
    /// @dev Anvil default key #0 — publicly known testnet placeholder.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    ProtocolRoles roles;
    ProtocolTimelock timelock;
    ComplianceRegistry compliance;
    PortfolioRegistry portfolios;
    InsuranceVault vault;
    VaultAllocator allocator;
    ClaimManager claims;
    ClaimReceipt receipts;
    AIAssessor assessor;
    MockUSDC usdc;
    address deployer;

    address safe = makeAddr("protocolSafe");
    address executor = makeAddr("timelockExecutor");
    address lp = makeAddr("institutionalLP");
    address outsider = makeAddr("outsider");

    uint256 constant MIN_DELAY = 1 hours;
    uint256 constant DEPOSIT = 500_000e6;
    uint256 constant COVERAGE = 400_000e6;
    uint256 constant CLAIM = 250_000e6;
    /// @dev Inside the allocator's per-portfolio concentration cap.
    uint256 constant ALLOCATION = 100_000e6;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        roles = deploy.protocolRoles();
        compliance = deploy.compliance();
        portfolios = deploy.portfolioRegistry();
        vault = deploy.vault();
        allocator = deploy.allocator();
        claims = deploy.claimManager();
        receipts = deploy.claimReceipt();
        assessor = deploy.assessor();
        usdc = deploy.usdc();
        deployer = deploy.deployer();

        _runGovernanceMigration();

        // Postcondition the script itself asserts before renouncing.
        assertTrue(roles.hasRole(roles.OWNER_ROLE(), address(timelock)), "timelock owns the protocol");
        assertFalse(roles.hasRole(roles.OWNER_ROLE(), deployer), "deployer renounced OWNER_ROLE");
        assertFalse(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), deployer), "deployer renounced DEFAULT_ADMIN_ROLE");
    }

    /// @notice REGRESSION (F-08): the retired key has no authority over ClaimReceipt.
    /// @dev Before the fix this key could revoke the ClaimManager's minter
    ///      authorisation and brick every claim in the protocol, permanently,
    ///      because ClaimReceipt answered to a private `Ownable` owner the
    ///      migration never transferred.
    function test_retiredDeployerHasNoAuthorityOverClaimReceipt() public {
        assertTrue(receipts.authorizedMinters(address(claims)), "ClaimManager can mint receipts");

        // The key that renounced OWNER_ROLE can no longer touch the claim path.
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedRegistrar.selector, deployer));
        receipts.setAuthorizedMinter(address(claims), false);

        // Nor can anyone else off the street.
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(ClaimReceipt.ClaimReceipt__UnauthorizedRegistrar.selector, outsider));
        receipts.setRegistrar(outsider);

        assertTrue(receipts.authorizedMinters(address(claims)), "claim path intact");
    }

    /// @notice REGRESSION (F-08): governance CAN act on ClaimReceipt, and reverse itself.
    /// @dev The other half of the property, and the one a naive fix breaks. A
    ///      kill-switch nobody can reach is as bad as one only a retired key can
    ///      reach: governance must be able to revoke a compromised minter AND
    ///      restore a legitimate one.
    function test_timelockAdministersClaimReceipt() public {
        vm.prank(address(timelock));
        receipts.setAuthorizedMinter(address(claims), false);
        assertFalse(receipts.authorizedMinters(address(claims)), "governance can revoke");

        vm.prank(address(timelock));
        receipts.setAuthorizedMinter(address(claims), true);
        assertTrue(receipts.authorizedMinters(address(claims)), "and restore - no one-way door");

        // Hoisted: an external call in argument position would consume the prank.
        address factoryAddr = address(deploy.factory());
        vm.prank(address(timelock));
        receipts.setRegistrar(factoryAddr);
        assertEq(receipts.registrar(), factoryAddr, "registrar is governance-set");
    }

    /// @notice REGRESSION (F-10): phase 2 enforces its own documented preconditions.
    /// @dev Written as ONE test on purpose. The script reads its configuration
    ///      from the environment, and `vm.setEnv` mutates process-wide state that
    ///      forge's parallel test execution shares — split into three tests they
    ///      race each other and fail intermittently. Sequencing the cases here
    ///      removes the race without weakening any assertion, and follows the
    ///      order an operator actually hits them in.
    ///
    ///      Before this, phase 2 checked only that the timelock held the two
    ///      admin roles, then printed "Governance now flows exclusively through
    ///      ProtocolTimelock". Stage A — moving Sentinel, Committee, Oracle,
    ///      Cedant, KYC, Allocator and Curator off the deploy key — lived in
    ///      docs/GOVERNANCE_PHASE2.md as prose, and prose does not stop a deploy.
    function test_phaseTwoEnforcesStageAAndRehearsal() public {
        // setUp already replayed the unguarded phase 2, so give the deploy key
        // its admin roles back and start from the state a real operator is in.
        bytes32 ownerRole = roles.OWNER_ROLE();
        bytes32 adminRole = roles.DEFAULT_ADMIN_ROLE();
        vm.startPrank(address(timelock));
        roles.grantRole(ownerRole, deployer);
        roles.grantRole(adminRole, deployer);
        vm.stopPrank();

        GovernanceMigration migration = new GovernanceMigration();
        _setPhaseTwoEnv(keccak256("never-happened"));

        // --- 1. Stage A not done: the deploy key still holds the operating set. ---
        assertTrue(roles.hasRole(roles.SENTINEL_ROLE(), deployer), "starting state: Stage A not done");
        vm.expectRevert(bytes("Stage A incomplete: deployer still SENTINEL_ROLE"));
        migration.run();
        assertTrue(roles.hasRole(ownerRole, deployer), "nothing renounced");

        // --- 2. Stage A done, but the timelock was never rehearsed. ---
        _completeStageA();
        vm.expectRevert(
            bytes("rehearsal not executed: REHEARSAL_OPERATION_ID is not a done operation on this timelock")
        );
        migration.run();
        assertTrue(roles.hasRole(ownerRole, deployer), "still nothing renounced");

        // --- 3. Both preconditions genuinely met: it completes. ---
        // Without this leg the guards could be unsatisfiable and the two refusals
        // above would still pass. A migration nobody can ever run is not a fix.
        bytes32 rehearsalId = _rehearseATimelockOperation();
        _setPhaseTwoEnv(rehearsalId);

        migration.run();

        assertFalse(roles.hasRole(ownerRole, deployer), "OWNER_ROLE renounced");
        assertFalse(roles.hasRole(adminRole, deployer), "DEFAULT_ADMIN_ROLE renounced");
        assertTrue(roles.hasRole(ownerRole, address(timelock)), "the timelock still governs");
    }

    // --- Helpers ---

    /// @dev Replays `script/GovernanceMigration.s.sol` phase 1 then phase 2.
    function _runGovernanceMigration() internal {
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = executor;

        vm.startPrank(deployer);
        timelock = new ProtocolTimelock(MIN_DELAY, proposers, executors, address(0));
        roles.grantRole(roles.OWNER_ROLE(), address(timelock));
        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock));

        // Phase 2, the step the script calls IRREVERSIBLE.
        roles.renounceRole(roles.OWNER_ROLE(), deployer);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);
        vm.stopPrank();
    }

    /// @dev Funds the vault, puts a portfolio on risk against THIS vault, and
    ///      carries a claim to the point where committee approval is all that is
    ///      left. Every step uses a role the migration left on the deploy key.
    function _liveClaimReadyForApproval(bytes32 evidence) internal returns (uint256 claimId, uint256 pid) {
        // KYC_OPERATOR_ROLE survived, so the retired key can still admit an LP.
        vm.startPrank(deployer);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));
        usdc.mint(lp, DEPOSIT);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT);
        vault.deposit(DEPOSIT, lp);
        vm.stopPrank();

        vm.startPrank(deployer); // AUTHORIZED_CEDANT_ROLE, retained
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Retained-key Treaty",
                metadataURI: "ipfs://x",
                documentHash: evidence,
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 20_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        // UNDERWRITING_CURATOR_ROLE, retained.
        portfolios.startReview(pid);
        portfolios.approvePortfolio(pid, 6_500);
        portfolios.activatePortfolio(pid);

        // ALLOCATOR_ROLE, retained: this is what satisfies the F-07 binding.
        // The size is deliberately well inside the allocator's concentration cap —
        // the binding asks whether the vault took the risk, not how much of it, so
        // a modest line is enough to unlock a claim for the full cover.
        uint256 propId = allocator.proposeAllocation(address(vault), pid, ALLOCATION);
        allocator.executeAllocation(propId);

        claimId = claims.submitClaim(address(vault), pid, CLAIM, ClaimManager.ClaimType.NON_PARAMETRIC, evidence);

        // ORACLE_ROLE, retained.
        assessor.publishAssessment(
            claimId,
            8_000,
            1_000,
            9_000,
            AIAssessor.Recommendation.APPROVE,
            CLAIM,
            keccak256(abi.encode(evidence, "ai"))
        );
        vm.stopPrank();

        claims.attachAssessment(claimId);
        vm.warp(block.timestamp + claims.disputeWindow() + 1);
    }

    /// @dev Stage A: move every operational role off the deploy key. Revoked
    ///      through the timelock, which is the only DEFAULT_ADMIN left.
    function _completeStageA() internal {
        bytes32[7] memory operational = [
            roles.SENTINEL_ROLE(),
            roles.CLAIMS_COMMITTEE_ROLE(),
            roles.ORACLE_ROLE(),
            roles.AUTHORIZED_CEDANT_ROLE(),
            roles.KYC_OPERATOR_ROLE(),
            roles.ALLOCATOR_ROLE(),
            roles.UNDERWRITING_CURATOR_ROLE()
        ];
        vm.startPrank(address(timelock));
        for (uint256 i; i < operational.length; i++) {
            roles.revokeRole(operational[i], deployer);
        }
        vm.stopPrank();
    }

    /// @dev Schedules and executes one real operation through the timelock, and
    ///      returns its id. This is the rehearsal phase 2 now insists on, so the
    ///      test has to perform it exactly as an operator would.
    function _rehearseATimelockOperation() internal returns (bytes32 opId) {
        bytes memory payload =
            abi.encodeWithSignature("grantRole(bytes32,address)", roles.SENTINEL_ROLE(), makeAddr("rehearsalGuardian"));
        bytes32 salt = keccak256("phase-2-rehearsal");

        vm.prank(safe); // PROPOSER
        timelock.schedule(address(roles), 0, payload, bytes32(0), salt, MIN_DELAY);
        vm.warp(block.timestamp + MIN_DELAY + 1);
        vm.prank(executor); // EXECUTOR
        timelock.execute(address(roles), 0, payload, bytes32(0), salt);

        opId = timelock.hashOperation(address(roles), 0, payload, bytes32(0), salt);
        assertTrue(timelock.isOperationDone(opId), "the rehearsal really executed");
    }

    function _setPhaseTwoEnv(bytes32 rehearsalId) internal {
        vm.setEnv("PROTOCOL_ROLES", vm.toString(address(roles)));
        vm.setEnv("TIMELOCK_ADDRESS", vm.toString(address(timelock)));
        vm.setEnv("RENOUNCE_DEPLOYER", "true");
        vm.setEnv("RETIRING_KEY", vm.toString(deployer));
        vm.setEnv("REHEARSAL_OPERATION_ID", vm.toString(rehearsalId));
    }
}
