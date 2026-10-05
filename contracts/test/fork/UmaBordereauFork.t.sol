// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {BordereauOracle} from "../../src/BordereauOracle.sol";
import {UmaBordereauOracle} from "../../src/UmaBordereauOracle.sol";
import {IOptimisticOracleV3} from "../../src/interfaces/uma/IOptimisticOracleV3.sol";

interface IFinderLike {
    function getImplementationAddress(bytes32 interfaceName) external view returns (address);
}

interface IOptimisticOracleV3Params {
    function burnedBondPercentage() external view returns (uint256);
    function numericalTrue() external view returns (int256);
    function finder() external view returns (address);
}

interface IOracleAncillaryLike {
    function getPrice(bytes32 identifier, uint256 time, bytes memory ancillaryData) external returns (int256);
}

/// @title UmaBordereauForkTest
/// @author Anton Carlo Santoro
/// @notice Forks the real Base Sepolia chain (id 84532) and runs UmaBordereauOracle against
///         UMA's deployed Optimistic Oracle V3 and Circle's USDC, with real token transfers,
///         real bond accounting and real callbacks. This is the proof that the interface in
///         src/interfaces/uma matches the deployment (the struct decodes, the whitelist and
///         the sync accept USDC, the callbacks arrive) and that the bond travels as intended.
/// @dev The one thing a fork cannot do is the vote itself. UMA's data verification mechanism
///      answers a disputed assertion only after its voters have ruled, days later, so the
///      dispute tests play that single step by mocking the DVM's `getPrice`; everything
///      around it is the live contract. Self-skips when BASE_SEPOLIA_RPC_URL is unset. To run:
///
///        BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///          forge test --match-path "test/fork/UmaBordereauFork*" -vvv
contract UmaBordereauForkTest is Test {
    // Pinned for reproducibility. A public Base Sepolia RPC prunes old state: when setUp starts
    // failing with "state at block N is pruned", refresh the pin or use an archive node.
    uint256 internal constant PINNED_BLOCK = 47_732_000;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    IOptimisticOracleV3 internal constant UMA = IOptimisticOracleV3(0x0F7fC5E6482f096380db6158f978167b57388deE);
    IERC20 internal constant USDC = IERC20(0x036CbD53842c5426634e7929541eC2318f3dCF7e);

    uint256 internal constant BOND = 100e6;
    bytes32 internal constant DATA_HASH = keccak256("premium-bordereau-2026-Q2");

    ProtocolRoles internal roles;
    PortfolioRegistry internal registry;
    UmaBordereauOracle internal bordereau;

    bool internal forked;
    uint256 internal pid;
    address internal dvm;
    address internal store;

    address internal admin = makeAddr("forkAdmin");
    address internal cedant = makeAddr("forkCedant");
    address internal sentinel = makeAddr("forkSentinel");
    address internal outsider = makeAddr("forkOutsider");

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // self-skip in CI

        vm.createSelectFork(rpc, PINNED_BLOCK);
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "not Base Sepolia");
        forked = true;

        address finder = IOptimisticOracleV3Params(address(UMA)).finder();
        dvm = IFinderLike(finder).getImplementationAddress("Oracle");
        store = IFinderLike(finder).getImplementationAddress("Store");

        vm.startPrank(admin);
        roles = new ProtocolRoles(admin);
        registry = new PortfolioRegistry(address(roles));
        bordereau = new UmaBordereauOracle(address(roles), address(registry), address(UMA), address(USDC), BOND);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedant);
        roles.grantRole(roles.SENTINEL_ROLE(), sentinel);
        vm.stopPrank();

        vm.prank(cedant);
        pid = registry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026",
                metadataURI: "ipfs://QmDocs",
                documentHash: keccak256("docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: 1_000_000e6,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );

        _fund(cedant);
        _fund(sentinel);
        _fund(outsider);
    }

    modifier onlyFork() {
        if (!forked) return;
        _;
    }

    function _fund(address who) internal {
        deal(address(USDC), who, 10_000e6);
        vm.prank(who);
        USDC.approve(address(bordereau), type(uint256).max);
        vm.prank(who);
        USDC.approve(address(UMA), type(uint256).max);
    }

    function _propose() internal returns (uint256 id) {
        vm.prank(cedant);
        id = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://QmBordereau", 100_000e6
        );
    }

    /// @dev Stand in for UMA's voters: the DVM answers every price request with this value.
    function _voters(int256 answer) internal {
        vm.mockCall(dvm, abi.encodeWithSelector(IOracleAncillaryLike.getPrice.selector), abi.encode(answer));
    }

    // ------------------------------------------------------------------ wiring

    function test_fork_constructorSyncsTheRealOracleWithCircleUsdc() public onlyFork {
        assertEq(address(bordereau.oracle()), address(UMA));
        assertEq(bordereau.identifier(), UMA.defaultIdentifier());
        assertEq(bordereau.identifier(), bytes32("ASSERT_TRUTH"));
        uint256 floor_ = UMA.getMinimumBond(address(USDC));
        assertEq(bordereau.effectiveBond(), floor_ > BOND ? floor_ : BOND, "effective bond follows UMA's floor");
    }

    // ------------------------------------------------------------------ undisputed

    function test_fork_proposeThenFinalize_bondGoesToUmaAndComesBack() public onlyFork {
        uint256 cedantStart = USDC.balanceOf(cedant);
        uint256 umaStart = USDC.balanceOf(address(UMA));
        uint256 bond = bordereau.effectiveBond();

        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);

        // The struct decodes against the live deployment and says what was asked.
        IOptimisticOracleV3.Assertion memory u = UMA.getAssertion(umaId);
        assertEq(u.asserter, cedant);
        assertEq(u.callbackRecipient, address(bordereau));
        assertEq(address(u.currency), address(USDC));
        assertEq(u.bond, bond);
        assertEq(u.identifier, bytes32("ASSERT_TRUTH"));
        assertEq(u.domainId, bordereau.DOMAIN_ID());
        assertEq(u.expirationTime, uint64(block.timestamp) + bordereau.liveness());
        assertEq(u.disputer, address(0));
        assertFalse(u.settled);

        assertEq(USDC.balanceOf(cedant), cedantStart - bond, "the bond left the proposer");
        assertEq(USDC.balanceOf(address(UMA)), umaStart + bond, "and sits in UMA");
        assertEq(USDC.balanceOf(address(bordereau)), 0, "none stays in the oracle contract");

        // Too early: UMA itself refuses, and so does this contract.
        vm.expectRevert();
        bordereau.finalizeAssertion(id);

        vm.warp(u.expirationTime);
        bordereau.finalizeAssertion(id);

        assertTrue(bordereau.isFinalized(id));
        assertTrue(UMA.getAssertion(umaId).settled);
        assertTrue(UMA.getAssertion(umaId).settlementResolution);
        assertEq(USDC.balanceOf(cedant), cedantStart, "the bond is back with the proposer");
        assertEq(USDC.balanceOf(address(UMA)), umaStart, "UMA kept nothing");
        assertEq(USDC.balanceOf(address(bordereau)), 0);
        assertEq(bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU).assertionId, id);
    }

    function test_fork_anyoneCanSettleOnUmaDirectly_andTheCallbackFinalizes() public onlyFork {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        vm.warp(UMA.getAssertion(umaId).expirationTime);

        vm.prank(outsider);
        UMA.settleAssertion(umaId);

        assertTrue(bordereau.isFinalized(id), "the live oracle's callback reached us");
    }

    // ------------------------------------------------------------------ disputed

    function test_fork_sentinelDisputes_umaRulesTrue_proposerWins() public onlyFork {
        uint256 bond = bordereau.effectiveBond();
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        uint256 cedantAfterPropose = USDC.balanceOf(cedant);
        uint256 sentinelStart = USDC.balanceOf(sentinel);
        uint256 storeStart = USDC.balanceOf(store);

        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "premium total does not match the statements");

        assertEq(uint8(bordereau.getAssertion(id).status), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        assertEq(UMA.getAssertion(umaId).disputer, sentinel);
        assertEq(USDC.balanceOf(sentinel), sentinelStart - bond, "the sentinel matched the bond");
        assertEq(USDC.balanceOf(address(bordereau)), 0);

        // Until the voters rule, nothing can settle it.
        vm.expectRevert();
        bordereau.settleDisputed(id);

        _voters(IOptimisticOracleV3Params(address(UMA)).numericalTrue());
        bordereau.settleDisputed(id);

        uint256 burned = bond * IOptimisticOracleV3Params(address(UMA)).burnedBondPercentage() / 1e18;
        assertTrue(bordereau.isFinalized(id));
        assertEq(
            USDC.balanceOf(cedant), cedantAfterPropose + 2 * bond - burned, "the winner takes both bonds less the burn"
        );
        assertEq(USDC.balanceOf(store) - storeStart, burned, "the burned share went to UMA's store");
        assertEq(USDC.balanceOf(address(bordereau)), 0);
    }

    function test_fork_sentinelDisputes_umaRulesFalse_assertionRejected_disputerWins() public onlyFork {
        uint256 bond = bordereau.effectiveBond();
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "figures are wrong");
        uint256 sentinelAfterDispute = USDC.balanceOf(sentinel);

        _voters(0);
        bordereau.settleDisputed(id);

        uint256 burned = bond * IOptimisticOracleV3Params(address(UMA)).burnedBondPercentage() / 1e18;
        assertEq(uint8(bordereau.getAssertion(id).status), uint8(BordereauOracle.AssertionStatus.REJECTED));
        assertFalse(bordereau.isFinalized(id));
        assertEq(USDC.balanceOf(sentinel), sentinelAfterDispute + 2 * bond - burned);
        assertEq(USDC.balanceOf(address(bordereau)), 0);
        vm.expectRevert();
        bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
    }

    function test_fork_anyoneCanDisputeOnUmaDirectly_andTheCallbackRecordsIt() public onlyFork {
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);

        vm.prank(outsider);
        UMA.disputeAssertion(umaId, outsider);

        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);
        assertEq(uint8(a.status), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        assertEq(a.disputer, outsider);
    }

    function test_fork_disputeAtExpiryIsRefusedByUma() public onlyFork {
        uint256 id = _propose();
        uint64 deadline = bordereau.getAssertion(id).livenessDeadline;
        vm.warp(deadline);
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(UmaBordereauOracle.UmaBordereauOracle__LivenessElapsed.selector, id, deadline)
        );
        bordereau.disputeAssertion(id, "too late");
    }

    function test_fork_theAssertionIsAnnouncedByTheLiveOracle() public onlyFork {
        vm.recordLogs();
        uint256 id = _propose();
        bytes32 umaId = bordereau.umaAssertionOf(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 made = keccak256(
            "AssertionMade(bytes32,bytes32,bytes,address,address,address,address,uint64,address,uint256,bytes32)"
        );
        uint256 seen;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(UMA) && logs[i].topics[0] == made) {
                assertEq(logs[i].topics[1], umaId, "the event is about our assertion");
                seen++;
            }
        }
        assertEq(seen, 1, "UMA announced it exactly once");
    }
}
