// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {VaultDeployer} from "../src/VaultDeployer.sol";
import {PremiumDistributor} from "../src/PremiumDistributor.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";

/// @title DeployStack
/// @author Anton Carlo Santoro
/// @notice Phase 11: full institutional stack deployment for **Base Sepolia
///         staging and local Anvil only**. Hard chain guard: any other chain
///         (including any mainnet) reverts.
///
///         NOT idempotent by design: every run deploys a FRESH stack and
///         overwrites `deployments/<chainId>-staging.json`. Reuse an existing
///         deployment by NOT re-running this script.
///
///         Order of operations (documented; tested in DeployStack.t.sol):
///           1. Settlement asset (MockUSDC staging faucet, or USDC_ADDRESS reuse)
///           2. ProtocolRoles (deployer = initial OWNER)
///           3. Registries + receipt + mock NAV price oracle
///           4. Oracle/AI layer (NavOracle, AIAssessor)
///           5. Economic modules (PremiumDistributor, VaultAllocator, ClaimManager)
///           6. Attestation + adapter layer (BordereauOracle, AdapterRegistry)
///           7. VaultFactory + staging vault
///           8. Wiring: ClaimReceipt registrar, vault claimManager/vaultAllocator
///              binding (Phase 9.5 sole paths), ClaimManager receipt minter
///           9. Canonical role grants (ordered; deployer keeps OWNER for staging)
///          10. NextBlockLens with the full module address book
///          11. On-chain verification: code.length, roles, lens availability
///          12. deployments JSON output
///
///         SECURITY: no real keys, no production addresses, no real funds.
///         PRIVATE_KEY in .env is a TESTNET placeholder. For production a
///         multisig/timelock handover (OWNER_ROLE) is mandatory — out of scope.
contract DeployStack is Script, ProtocolRoleConstants {
    // --- Chain guard ---
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 public constant ANVIL_CHAIN_ID = 31337;

    error DeployStack__UnexpectedChain(uint256 chainId);
    error DeployStack__VerificationFailed(string check);

    // --- Deployed stack (storage keeps the script stack-shallow) ---
    MockUSDC public usdc;
    ProtocolRoles public protocolRoles;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockOracle public mockOracle;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    NavOracle public navOracle;
    AIAssessor public assessor;
    PremiumDistributor public distributor;
    VaultAllocator public allocator;
    ClaimManager public claimManager;
    BordereauOracle public bordereau;
    AdapterRegistry public adapterRegistry;
    VaultFactory public factory;
    VaultDeployer public vaultDeployer;
    InsuranceVault public vault;
    NextBlockLens public lens;

    // --- Role configuration (env-driven; defaults to deployer for staging) ---
    address public deployer;
    address public ownerAddr;
    address public curatorAddr;
    address public sentinelAddr;
    address public committeeAddr;
    address public allocatorBotAddr;
    address public oracleNodeAddr;
    address public cedantAddr;
    address public kycOperatorAddr;
    /// @dev Optional settlement-asset override (set by runWithConfig; the CLI
    ///      path feeds it from USDC_ADDRESS).
    address internal usdcOverrideAddr;

    /// @dev CLI entrypoint: reads configuration from env, then delegates.
    function run() external {
        runWithConfig(
            vm.envUint("PRIVATE_KEY"), // testnet placeholder key only
            vm.envOr("WRITE_DEPLOYMENT_JSON", true),
            vm.envOr("USDC_ADDRESS", address(0))
        );
    }

    /// @dev Parameterized entrypoint: tests call this directly so no test ever
    ///      touches process-global env (vm.setEnv races across parallel suites
    ///      — a foreign USDC_ADDRESS made lens verification fail flakily).
    function runWithConfig(uint256 pk, bool writeJson, address usdcOverride) public {
        _guardChain();

        deployer = vm.addr(pk);
        usdcOverrideAddr = usdcOverride;
        _loadRoleConfig();

        vm.startBroadcast(pk);
        _deployCore();
        _deployModules();
        _deployVault();
        _wireAndGrant();
        _deployLens();
        vm.stopBroadcast();

        _verifyDeployment();

        if (writeJson) {
            _writeAddresses();
        }
        _logSummary();
    }

    // --- Steps ---

    function _guardChain() internal view {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID && block.chainid != ANVIL_CHAIN_ID) {
            revert DeployStack__UnexpectedChain(block.chainid);
        }
    }

    function _loadRoleConfig() internal {
        ownerAddr = vm.envOr("OWNER_ADDRESS", deployer);
        curatorAddr = vm.envOr("CURATOR_ADDRESS", deployer);
        sentinelAddr = vm.envOr("SENTINEL_ADDRESS", deployer);
        committeeAddr = vm.envOr("COMMITTEE_ADDRESS", deployer);
        allocatorBotAddr = vm.envOr("ALLOCATOR_ADDRESS", deployer);
        oracleNodeAddr = vm.envOr("ORACLE_ADDRESS", deployer);
        cedantAddr = vm.envOr("CEDANT_ADDRESS", deployer);
        kycOperatorAddr = vm.envOr("KYC_OPERATOR_ADDRESS", deployer);
    }

    function _deployCore() internal {
        // Settlement asset: reuse the configured USDC if it is deployed,
        // otherwise deploy the staging MockUSDC faucet.
        address usdcEnv = usdcOverrideAddr;
        if (usdcEnv != address(0) && usdcEnv.code.length > 0) {
            usdc = MockUSDC(usdcEnv);
        } else {
            usdc = new MockUSDC();
        }

        protocolRoles = new ProtocolRoles(deployer);
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        mockOracle = new MockOracle();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
    }

    function _deployModules() internal {
        navOracle = new NavOracle(address(protocolRoles), address(portfolioRegistry));
        assessor = new AIAssessor(address(protocolRoles));
        distributor = new PremiumDistributor(address(usdc), address(protocolRoles), address(portfolioRegistry));
        allocator = new VaultAllocator(address(protocolRoles), address(portfolioRegistry), address(navOracle));
        claimManager = new ClaimManager(
            address(protocolRoles), address(portfolioRegistry), address(assessor), address(claimReceipt)
        );
        bordereau = new BordereauOracle(address(protocolRoles), address(portfolioRegistry));
        adapterRegistry = new AdapterRegistry(address(protocolRoles));
    }

    function _deployVault() internal {
        vaultDeployer = new VaultDeployer();
        factory = new VaultFactory(
            address(usdc),
            address(policyRegistry),
            address(mockOracle),
            address(claimReceipt),
            address(protocolRoles),
            address(compliance),
            address(portfolioRegistry),
            address(vaultDeployer)
        );
        // Bind-once: only this factory can deploy vaults through the deployer.
        vaultDeployer.bindFactory(address(factory));
        // Factory must be able to register vaults as receipt minters.
        claimReceipt.setRegistrar(address(factory));

        // createVault requires curator role on caller AND manager.
        protocolRoles.grantRole(UNDERWRITING_CURATOR_ROLE, deployer);
        if (curatorAddr != deployer) {
            protocolRoles.grantRole(UNDERWRITING_CURATOR_ROLE, curatorAddr);
        }
        vault = InsuranceVault(
            // Share symbol intentionally avoids a "USDC"/stable connotation: the
            // share is a NAV-bearing reinsurance vault token, not a 1:1 stablecoin.
            factory.createVault(
                "NextBlock Reinsurance Vault - Balanced", "nbRV-BAL", "Balanced Core", curatorAddr, 2000, 0
            )
        );
    }

    function _wireAndGrant() internal {
        // Phase 9.5 binding: the vault trusts exactly these two contracts.
        vault.setClaimManager(address(claimManager));
        vault.setVaultAllocator(address(allocator));
        claimReceipt.setAuthorizedMinter(address(claimManager), true);

        // Ordered canonical grants (contracts first, then operators).
        protocolRoles.grantRole(ALLOCATOR_ROLE, address(allocator));
        protocolRoles.grantRole(PREMIUM_DEPOSITOR_ROLE, address(distributor));
        protocolRoles.grantRole(VAULT_FACTORY_ROLE, address(factory));

        protocolRoles.grantRole(ALLOCATOR_ROLE, allocatorBotAddr);
        protocolRoles.grantRole(SENTINEL_ROLE, sentinelAddr);
        protocolRoles.grantRole(CLAIMS_COMMITTEE_ROLE, committeeAddr);
        protocolRoles.grantRole(ORACLE_ROLE, oracleNodeAddr);
        protocolRoles.grantRole(AUTHORIZED_CEDANT_ROLE, cedantAddr);
        protocolRoles.grantRole(KYC_OPERATOR_ROLE, kycOperatorAddr);
        if (ownerAddr != deployer) {
            // Staging handover: grant OWNER to the configured owner. The
            // deployer keeps OWNER for staging operability; production
            // requires a multisig/timelock handover + deployer revocation.
            protocolRoles.grantRole(OWNER_ROLE, ownerAddr);
        }
    }

    function _deployLens() internal {
        lens = new NextBlockLens(
            address(protocolRoles),
            NextBlockLens.ModuleAddresses({
                portfolioRegistry: address(portfolioRegistry),
                complianceRegistry: address(compliance),
                vaultFactory: address(factory),
                premiumDistributor: address(distributor),
                navOracle: address(navOracle),
                vaultAllocator: address(allocator),
                claimManager: address(claimManager),
                aiAssessor: address(assessor),
                bordereauOracle: address(bordereau),
                adapterRegistry: address(adapterRegistry)
            })
        );
    }

    // --- Post-deploy verification (reverts the script on any failure) ---

    function _verifyDeployment() internal view {
        // 1. Address book validated: every module must have code.
        _requireCode(address(usdc), "usdc");
        _requireCode(address(protocolRoles), "protocolRoles");
        _requireCode(address(policyRegistry), "policyRegistry");
        _requireCode(address(claimReceipt), "claimReceipt");
        _requireCode(address(mockOracle), "mockOracle");
        _requireCode(address(compliance), "compliance");
        _requireCode(address(portfolioRegistry), "portfolioRegistry");
        _requireCode(address(navOracle), "navOracle");
        _requireCode(address(assessor), "assessor");
        _requireCode(address(distributor), "distributor");
        _requireCode(address(allocator), "allocator");
        _requireCode(address(claimManager), "claimManager");
        _requireCode(address(bordereau), "bordereau");
        _requireCode(address(adapterRegistry), "adapterRegistry");
        _requireCode(address(factory), "factory");
        _requireCode(address(vaultDeployer), "vaultDeployer");
        _requireCode(address(vault), "vault");
        _requireCode(address(lens), "lens");

        // 2. Roles verified post-deploy.
        _requireRole(OWNER_ROLE, ownerAddr, "owner");
        _requireRole(UNDERWRITING_CURATOR_ROLE, curatorAddr, "curator");
        _requireRole(SENTINEL_ROLE, sentinelAddr, "sentinel");
        _requireRole(CLAIMS_COMMITTEE_ROLE, committeeAddr, "committee");
        _requireRole(ALLOCATOR_ROLE, allocatorBotAddr, "allocatorBot");
        _requireRole(ALLOCATOR_ROLE, address(allocator), "allocatorContract");
        _requireRole(ORACLE_ROLE, oracleNodeAddr, "oracleNode");
        _requireRole(AUTHORIZED_CEDANT_ROLE, cedantAddr, "cedant");
        _requireRole(KYC_OPERATOR_ROLE, kycOperatorAddr, "kycOperator");
        _requireRole(PREMIUM_DEPOSITOR_ROLE, address(distributor), "distributor");

        // 3. Phase 9.5 binding: sole claim/allocation paths.
        if (vault.claimManager() != address(claimManager)) {
            revert DeployStack__VerificationFailed("vault.claimManager binding");
        }
        if (vault.vaultAllocator() != address(allocator)) {
            revert DeployStack__VerificationFailed("vault.vaultAllocator binding");
        }

        // 4. Lens configured and readable immediately after deploy.
        NextBlockLens.ProtocolStatusView memory ps = lens.getProtocolStatus();
        if (ps.modules.claimManager != address(claimManager)) {
            revert DeployStack__VerificationFailed("lens module book");
        }
        if (ps.vaultCount != 1) revert DeployStack__VerificationFailed("lens vaultCount");
        NextBlockLens.VaultDashboardView memory vd = lens.getVaultDashboard(address(vault));
        if (vd.status != NextBlockLens.DataStatus.AVAILABLE) {
            revert DeployStack__VerificationFailed("lens vault dashboard");
        }

        // 5. Settlement asset shape.
        if (usdc.decimals() != 6) revert DeployStack__VerificationFailed("usdc decimals");
    }

    function _requireCode(address target, string memory tag) internal view {
        if (target.code.length == 0) revert DeployStack__VerificationFailed(string.concat("no code: ", tag));
    }

    function _requireRole(bytes32 role, address holder, string memory tag) internal view {
        if (!protocolRoles.hasRole(role, holder)) {
            revert DeployStack__VerificationFailed(string.concat("missing role: ", tag));
        }
    }

    // --- Deterministic deployments JSON ---

    function _writeAddresses() internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeUint(obj, "timestamp", block.timestamp);
        vm.serializeUint(obj, "lensVersion", lens.LENS_VERSION());
        vm.serializeUint(obj, "schemaVersion", lens.SCHEMA_VERSION());
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "usdc", address(usdc));
        vm.serializeAddress(obj, "protocolRoles", address(protocolRoles));
        vm.serializeAddress(obj, "policyRegistry", address(policyRegistry));
        vm.serializeAddress(obj, "claimReceipt", address(claimReceipt));
        vm.serializeAddress(obj, "mockOracle", address(mockOracle));
        vm.serializeAddress(obj, "complianceRegistry", address(compliance));
        vm.serializeAddress(obj, "portfolioRegistry", address(portfolioRegistry));
        vm.serializeAddress(obj, "navOracle", address(navOracle));
        vm.serializeAddress(obj, "aiAssessor", address(assessor));
        vm.serializeAddress(obj, "premiumDistributor", address(distributor));
        vm.serializeAddress(obj, "vaultAllocator", address(allocator));
        vm.serializeAddress(obj, "claimManager", address(claimManager));
        vm.serializeAddress(obj, "bordereauOracle", address(bordereau));
        vm.serializeAddress(obj, "adapterRegistry", address(adapterRegistry));
        vm.serializeAddress(obj, "vaultFactory", address(factory));
        vm.serializeAddress(obj, "vaultDeployer", address(vaultDeployer));
        vm.serializeAddress(obj, "vault", address(vault));
        vm.serializeAddress(obj, "owner", ownerAddr);
        vm.serializeAddress(obj, "curator", curatorAddr);
        vm.serializeAddress(obj, "sentinel", sentinelAddr);
        vm.serializeAddress(obj, "committee", committeeAddr);
        vm.serializeAddress(obj, "allocatorBot", allocatorBotAddr);
        vm.serializeAddress(obj, "oracleNode", oracleNodeAddr);
        vm.serializeAddress(obj, "cedant", cedantAddr);
        vm.serializeAddress(obj, "kycOperator", kycOperatorAddr);
        string memory json = vm.serializeAddress(obj, "lens", address(lens));

        string memory path = string.concat("deployments/", vm.toString(block.chainid), "-staging.json");
        vm.writeJson(json, path);
        console2.log("deployments JSON written:", path);
    }

    function _logSummary() internal view {
        console2.log("=== NextBlock staging stack deployed ===");
        console2.log("chainId:        ", block.chainid);
        console2.log("protocolRoles:  ", address(protocolRoles));
        console2.log("lens:           ", address(lens));
        console2.log("vault:          ", address(vault));
        console2.log("usdc (mock):    ", address(usdc));
        console2.log("NOT idempotent: each run deploys a fresh stack.");
    }
}
