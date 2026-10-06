// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";
import {UmaBordereauOracle} from "../src/UmaBordereauOracle.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {MockOptimisticOracleV3} from "./mocks/MockOptimisticOracleV3.sol";

/// @dev A valid portfolio submission for tests that only need a portfolio to exist.
library PortfolioRegistryParams {
    function make(uint256 nowTs) internal pure returns (PortfolioRegistry.SubmissionParams memory p) {
        p = PortfolioRegistry.SubmissionParams({
            name: "EU Property CAT QS 2026",
            metadataURI: "ipfs://QmDocs",
            documentHash: keccak256("docs"),
            lineOfBusiness: "Property CAT",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: 1_000_000e6,
            cededPremium: 100_000e6,
            inceptionTime: uint64(nowTs),
            expiryTime: uint64(nowTs + 365 days)
        });
    }
}

/// @title DeployStackTest
/// @notice Phase 11 suite: full-stack deploy on the local chain (31337), chain
///         guard against unexpected networks, post-deploy wiring/roles/lens
///         verification and the staging MockUSDC faucet cap.
contract DeployStackTest is Test {
    DeployStack public deploy;

    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function setUp() public {
        deploy = new DeployStack();
    }

    function test_run_deploysWiresAndVerifies() public {
        // chainid in forge tests is 31337: allowed by the guard.
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        ProtocolRoles roles = deploy.protocolRoles();
        address deployer = deploy.deployer();
        assertEq(deployer, ANVIL_DEPLOYER);

        // Roles (defaults: deployer holds every operator role in staging)
        assertTrue(roles.hasRole(roles.OWNER_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.SENTINEL_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.CLAIMS_COMMITTEE_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.ORACLE_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), deployer));
        assertTrue(roles.hasRole(roles.KYC_OPERATOR_ROLE(), deployer));
        // Contracts hold their operational roles
        assertTrue(roles.hasRole(roles.ALLOCATOR_ROLE(), address(deploy.allocator())));
        assertTrue(roles.hasRole(roles.PREMIUM_DEPOSITOR_ROLE(), address(deploy.distributor())));

        // Phase 9.5 bindings
        assertEq(deploy.vault().claimManager(), address(deploy.claimManager()));
        assertEq(deploy.vault().vaultAllocator(), address(deploy.allocator()));

        // Lens configured and immediately readable (UI-ready)
        NextBlockLens lens = deploy.lens();
        NextBlockLens.ProtocolStatusView memory ps = lens.getProtocolStatus();
        assertEq(ps.vaultCount, 1);
        assertEq(ps.modules.claimManager, address(deploy.claimManager()));
        NextBlockLens.VaultDashboardView memory vd = lens.getVaultDashboard(address(deploy.vault()));
        assertEq(uint8(vd.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(vd.boundClaimManager, address(deploy.claimManager()));

        // Settlement asset
        assertEq(deploy.usdc().decimals(), 6);
    }

    function test_run_rejectsUnexpectedChain() public {
        // Mainnet (1) and Base mainnet (8453) must both be refused: staging only.
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__UnexpectedChain.selector, 1));
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__UnexpectedChain.selector, 8453));
        deploy.runWithConfig(ANVIL_PK, false, address(0));
    }

    function test_run_reusesConfiguredUsdc() public {
        MockUSDC existing = new MockUSDC();
        deploy.runWithConfig(ANVIL_PK, false, address(existing));
        assertEq(address(deploy.usdc()), address(existing));
    }

    function test_mockUSDC_faucetCap() public {
        deploy.runWithConfig(ANVIL_PK, false, address(0));
        MockUSDC usdc = deploy.usdc();
        address user = makeAddr("faucetUser");
        uint256 cap = usdc.FAUCET_CAP();

        // Anyone can mint up to the cap (staging faucet)
        vm.prank(user);
        usdc.mint(user, cap);
        assertEq(usdc.balanceOf(user), cap);

        // Above the cap: rejected for non-deployer callers
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.MockUSDC__FaucetCapExceeded.selector, cap + 1, cap));
        usdc.mint(user, cap + 1);

        // The deployer is uncapped (demo seeding)
        vm.prank(usdc.deployer());
        usdc.mint(user, cap + 1);
        assertEq(usdc.balanceOf(user), cap + cap + 1);
    }

    /// @dev The env-driven path is where a forgotten variable turns into "this
    ///      role is the deployer's". On the shared testnet that must fail loudly
    ///      instead of deploying a world with no separation of duties in it.
    function test_rolesFromEnv_refusesAnUnsetRoleOnBaseSepolia() public {
        // Needs the role variables unset, as they are on CI. A developer who has
        // them exported for a real deploy has nothing to learn from this test.
        if (
            vm.envExists("CURATOR_ADDRESS") || vm.envExists("ALLOCATOR_ADDRESS") || vm.envExists("SENTINEL_ADDRESS")
                || vm.envExists("ALLOW_SINGLE_KEY")
        ) vm.skip(true);

        vm.chainId(84532);
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__RoleNotSeparated.selector, "CURATOR_ADDRESS"));
        deploy.rolesFromEnv(ANVIL_DEPLOYER);
    }

    /// @dev The same call on the local chain keeps the convenience default, so
    ///      every existing local flow is unchanged.
    function test_rolesFromEnv_keepsTheSingleKeyDefaultLocally() public {
        if (vm.envExists("CURATOR_ADDRESS") || vm.envExists("OWNER_ADDRESS")) vm.skip(true);

        DeployStack.RoleConfig memory roles = deploy.rolesFromEnv(ANVIL_DEPLOYER);
        assertEq(roles.curator, ANVIL_DEPLOYER, "local default");
        assertEq(roles.kycOperator, ANVIL_DEPLOYER, "local default");
    }

    /// @dev A configured asset with nothing deployed behind it is a mistake (wrong
    ///      chain, a typo). It used to fall through to a freshly deployed MockUSDC,
    ///      i.e. a vault settling in a token anyone can mint, without a word.
    function test_run_refusesAConfiguredAssetThatIsNotDeployed() public {
        address nothingHere = makeAddr("nothingHere");
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__AssetNotDeployed.selector, nothingHere));
        deploy.runWithConfig(ANVIL_PK, false, nothingHere);
    }

    /// @dev On Base Sepolia the env path refuses to fall back to the mock asset.
    function test_usdcFromEnv_refusesAnUnsetAssetOnBaseSepolia() public {
        if (vm.envExists("USDC_ADDRESS") || vm.envExists("ALLOW_MOCK_USDC")) vm.skip(true);

        vm.chainId(84532);
        vm.expectRevert(DeployStack.DeployStack__MockAssetOnSharedChain.selector);
        deploy.usdcFromEnv();
    }

    /// @dev Locally the mock stays the default, so every local flow is unchanged.
    function test_usdcFromEnv_keepsTheMockDefaultLocally() public {
        if (vm.envExists("USDC_ADDRESS")) vm.skip(true);
        assertEq(deploy.usdcFromEnv(), address(0));
    }

    // ------------------------------------------------------------------ bordereau backend

    function _roles(address who) internal pure returns (DeployStack.RoleConfig memory r) {
        r = DeployStack.RoleConfig({
            owner: who,
            curator: who,
            sentinel: who,
            committee: who,
            allocatorBot: who,
            oracleNode: who,
            cedant: who,
            kycOperator: who
        });
    }

    /// @dev Local chains deploy the bond-less stand-in, and the Lens is pointed at it.
    function test_run_localChainsKeepTheStandInBordereau() public {
        if (vm.envExists("UMA_OOV3_ADDRESS")) vm.skip(true);

        deploy.runWithConfig(ANVIL_PK, false, address(0));

        assertTrue(address(deploy.bordereau()) != address(0));
        assertEq(address(deploy.umaBordereau()), address(0));
        assertEq(deploy.bordereauModule(), address(deploy.bordereau()));
        assertEq(deploy.umaOracle(), address(0));
        assertEq(deploy.lens().getProtocolStatus().modules.bordereauOracle, address(deploy.bordereau()));
    }

    /// @dev Given an oracle, the UMA-backed one is deployed against it, bonded in the settlement
    ///      asset, with the roles, the Lens and the verification all pointing at it.
    function test_run_withUmaDeploysTheBondedBordereau() public {
        MockUSDC asset = new MockUSDC();
        MockOptimisticOracleV3 uma = new MockOptimisticOracleV3(0.5e18);
        uma.setWhitelisted(address(asset), true);

        deploy.runWithUma(ANVIL_PK, false, address(asset), _roles(ANVIL_DEPLOYER), address(uma), 25e6);

        UmaBordereauOracle module = deploy.umaBordereau();
        assertEq(address(deploy.bordereau()), address(0), "the stand-in is not deployed beside it");
        assertEq(deploy.bordereauModule(), address(module));
        assertEq(address(module.oracle()), address(uma));
        assertEq(address(module.bondCurrency()), address(asset));
        assertEq(address(module.protocolRoles()), address(deploy.protocolRoles()));
        assertEq(address(module.portfolioRegistry()), address(deploy.portfolioRegistry()));
        assertEq(module.bondAmount(), 25e6);
        assertTrue(uma.synced(address(asset)), "UMA cached the asset at deployment");
        assertEq(deploy.lens().getProtocolStatus().modules.bordereauOracle, address(module));
    }

    /// @dev The deployed oracle works end to end for the operators the deployment named.
    function test_run_withUmaTheNamedOperatorsCanUseIt() public {
        MockUSDC asset = new MockUSDC();
        MockOptimisticOracleV3 uma = new MockOptimisticOracleV3(0.5e18);
        uma.setWhitelisted(address(asset), true);
        deploy.runWithUma(ANVIL_PK, false, address(asset), _roles(ANVIL_DEPLOYER), address(uma), 10e6);

        UmaBordereauOracle module = deploy.umaBordereau();
        ProtocolRoles roles = deploy.protocolRoles();
        assertTrue(roles.hasRole(roles.ORACLE_ROLE(), ANVIL_DEPLOYER));
        assertTrue(roles.hasRole(roles.SENTINEL_ROLE(), ANVIL_DEPLOYER));

        // A portfolio the feed can assert on, a bond, and one assertion carried to finality.
        vm.startPrank(ANVIL_DEPLOYER);
        uint256 pid = deploy.portfolioRegistry().submitPortfolio(PortfolioRegistryParams.make(block.timestamp));
        asset.mint(ANVIL_DEPLOYER, 10e6);
        asset.approve(address(module), type(uint256).max);
        asset.approve(address(uma), type(uint256).max);
        uint256 id = module.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, keccak256("d"), "ipfs://x", 1
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        module.finalizeAssertion(id);
        assertTrue(module.isFinalized(id));
        assertEq(asset.balanceOf(ANVIL_DEPLOYER), 10e6, "the bond came back");
        assertEq(asset.balanceOf(address(module)), 0);
    }

    /// @dev An oracle address with nothing behind it is refused by name, not as a bare revert.
    function test_run_withUmaRefusesAnOracleWithNoCode() public {
        MockUSDC asset = new MockUSDC();
        address nothingHere = makeAddr("noUmaHere");
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__UmaNotDeployed.selector, nothingHere));
        deploy.runWithUma(ANVIL_PK, false, address(asset), _roles(ANVIL_DEPLOYER), nothingHere, 10e6);
    }

    /// @dev UMA must accept the settlement asset as a bond: a deployment whose asset is not on its
    ///      whitelist fails at the constructor, not later at the first proposal.
    function test_run_withUmaRefusesAnAssetUmaDoesNotAccept() public {
        MockUSDC asset = new MockUSDC();
        MockOptimisticOracleV3 uma = new MockOptimisticOracleV3(0.5e18); // nothing whitelisted
        vm.expectRevert(bytes("Unsupported currency"));
        deploy.runWithUma(ANVIL_PK, false, address(asset), _roles(ANVIL_DEPLOYER), address(uma), 10e6);
    }

    /// @dev On Base Sepolia with a real asset the choice is UMA's deployment, with no env involved.
    function test_run_baseSepoliaWithARealAssetUsesUmasDeployment() public {
        if (vm.envExists("UMA_OOV3_ADDRESS") || vm.envExists("BORDEREAU_BOND")) vm.skip(true);

        vm.chainId(84532);
        MockOptimisticOracleV3 template = new MockOptimisticOracleV3(0.5e18);
        address umaAt = deploy.UMA_OOV3_BASE_SEPOLIA();
        vm.etch(umaAt, address(template).code);
        MockUSDC asset = new MockUSDC(); // stands for Circle's USDC, whitelisted by UMA
        MockOptimisticOracleV3(umaAt).setWhitelisted(address(asset), true);

        address who = makeAddr("operator");
        deploy.runWithRoles(ANVIL_PK, false, address(asset), _roles(who));

        assertEq(deploy.umaOracle(), umaAt);
        assertEq(address(deploy.umaBordereau().oracle()), umaAt);
        assertEq(deploy.umaBordereau().bondAmount(), deploy.DEFAULT_BORDEREAU_BOND());
        assertEq(address(deploy.bordereau()), address(0), "no stand-in on the shared chain");
    }

    /// @dev The throwaway mock-asset deployment keeps the stand-in: a token anyone can mint is not
    ///      on UMA's bond whitelist, and the opt-out is explicit.
    function test_run_baseSepoliaWithTheMockAssetKeepsTheStandIn() public {
        if (vm.envExists("UMA_OOV3_ADDRESS")) vm.skip(true);

        vm.chainId(84532);
        deploy.runWithRoles(ANVIL_PK, false, address(0), _roles(makeAddr("operator")));

        assertEq(deploy.umaOracle(), address(0));
        assertTrue(address(deploy.bordereau()) != address(0));
        assertEq(address(deploy.umaBordereau()), address(0));
    }
}
