// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";

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
        vm.setEnv("PRIVATE_KEY", vm.toString(ANVIL_PK));
        vm.setEnv("WRITE_DEPLOYMENT_JSON", "false"); // tests must not write files
        deploy = new DeployStack();
    }

    function test_run_deploysWiresAndVerifies() public {
        // chainid in forge tests is 31337: allowed by the guard.
        deploy.run();

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
        deploy.run();

        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(DeployStack.DeployStack__UnexpectedChain.selector, 8453));
        deploy.run();
    }

    function test_run_reusesConfiguredUsdc() public {
        MockUSDC existing = new MockUSDC();
        vm.setEnv("USDC_ADDRESS", vm.toString(address(existing)));
        deploy.run();
        assertEq(address(deploy.usdc()), address(existing));
        vm.setEnv("USDC_ADDRESS", vm.toString(address(0))); // reset for other tests
    }

    function test_mockUSDC_faucetCap() public {
        deploy.run();
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
}
