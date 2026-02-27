// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title DemoSetup
/// @notice Deploys everything, creates 8 vaults, registers 13 policies, funds premiums.
///         Run: forge script script/DemoSetup.s.sol --rpc-url $RPC_URL --broadcast
///         For Anvil: forge script script/DemoSetup.s.sol --rpc-url http://localhost:8545 --broadcast
/// @dev Uses two wallets:
///         Wallet 1 (deployer/admin): All platform roles + vault manager for all vaults
///         Wallet 2 (investor): Investor only, funded with MockUSDC
contract DemoSetup is Script {
    // =====================================================================
    //  Policy Constants (P1-P13)
    // =====================================================================

    // P1: BTC Price Protection (ON_CHAIN)
    uint256 constant COVERAGE_P1  = 50_000e6;
    uint256 constant PREMIUM_P1   = 2_500e6;
    uint256 constant DURATION_P1  = 90 days;
    int256  constant THRESHOLD_P1 = 80_000e8;

    // P2: Flight Delay (ORACLE_DEPENDENT)
    uint256 constant COVERAGE_P2  = 15_000e6;
    uint256 constant PREMIUM_P2   = 1_200e6;
    uint256 constant DURATION_P2  = 60 days;

    // P3: Commercial Fire (OFF_CHAIN)
    uint256 constant COVERAGE_P3  = 40_000e6;
    uint256 constant PREMIUM_P3   = 2_400e6;
    uint256 constant DURATION_P3  = 180 days;

    // P4: ETH Crash Protection (ON_CHAIN)
    uint256 constant COVERAGE_P4  = 30_000e6;
    uint256 constant PREMIUM_P4   = 1_800e6;
    uint256 constant DURATION_P4  = 90 days;
    int256  constant THRESHOLD_P4 = 3_000e8;

    // P5: BTC Catastrophe Cover (ON_CHAIN)
    uint256 constant COVERAGE_P5  = 100_000e6;
    uint256 constant PREMIUM_P5   = 6_000e6;
    uint256 constant DURATION_P5  = 180 days;
    int256  constant THRESHOLD_P5 = 60_000e8;

    // P6: Stablecoin Depeg Guard (ON_CHAIN)
    uint256 constant COVERAGE_P6  = 25_000e6;
    uint256 constant PREMIUM_P6   = 3_000e6;
    uint256 constant DURATION_P6  = 365 days;
    int256  constant THRESHOLD_P6 = 50_000e8;

    // P7: Hurricane Season Cover (ORACLE_DEPENDENT)
    uint256 constant COVERAGE_P7  = 80_000e6;
    uint256 constant PREMIUM_P7   = 8_000e6;
    uint256 constant DURATION_P7  = 180 days;

    // P8: Earthquake Protection (ORACLE_DEPENDENT)
    uint256 constant COVERAGE_P8  = 60_000e6;
    uint256 constant PREMIUM_P8   = 4_200e6;
    uint256 constant DURATION_P8  = 365 days;

    // P9: Drought Index (ORACLE_DEPENDENT)
    uint256 constant COVERAGE_P9  = 20_000e6;
    uint256 constant PREMIUM_P9   = 2_000e6;
    uint256 constant DURATION_P9  = 120 days;

    // P10: Marine Cargo (OFF_CHAIN)
    uint256 constant COVERAGE_P10 = 45_000e6;
    uint256 constant PREMIUM_P10  = 3_600e6;
    uint256 constant DURATION_P10 = 90 days;

    // P11: Professional Liability (OFF_CHAIN)
    uint256 constant COVERAGE_P11 = 35_000e6;
    uint256 constant PREMIUM_P11  = 1_750e6;
    uint256 constant DURATION_P11 = 365 days;

    // P12: Cyber Insurance (OFF_CHAIN)
    uint256 constant COVERAGE_P12 = 70_000e6;
    uint256 constant PREMIUM_P12  = 5_600e6;
    uint256 constant DURATION_P12 = 180 days;

    // P13: Equipment Breakdown (OFF_CHAIN)
    uint256 constant COVERAGE_P13 = 55_000e6;
    uint256 constant PREMIUM_P13  = 3_850e6;
    uint256 constant DURATION_P13 = 365 days;

    // =====================================================================
    //  Deployed Contracts (stored as state to share between helper functions)
    // =====================================================================
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    VaultFactory public factory;

    address public vaultAAddr;
    address public vaultBAddr;
    address public vaultCAddr;
    address public vaultDAddr;
    address public vaultEAddr;
    address public vaultFAddr;
    address public vaultGAddr;
    address public vaultHAddr;

    // Policy IDs (set during phase 3)
    uint256 public p1;
    uint256 public p2;
    uint256 public p3;
    uint256 public p4;
    uint256 public p5;
    uint256 public p6;
    uint256 public p7;
    uint256 public p8;
    uint256 public p9;
    uint256 public p10;
    uint256 public p11;
    uint256 public p12;
    uint256 public p13;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address investor;
        try vm.envAddress("INVESTOR_ADDRESS") returns (address addr) {
            investor = addr;
        } catch {
            investor = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        }

        console.log("=== NextBlock Demo Setup (13 Policies, 8 Vaults) ===");
        console.log("Deployer/Admin:", deployer);
        console.log("Investor:", investor);
        console.log("");

        vm.startBroadcast(deployerKey);

        _phase1Deploy(deployer);
        _phase2CreateVaults(deployer);
        _phase2bSeedDeposits(deployer);
        _phase3RegisterPolicies(deployer);
        _phase4AddPoliciesAndFund(deployer);
        _phase5DemoState(deployer, investor);

        vm.stopBroadcast();

        _printSummary(deployer, investor);
    }

    // ============================================
    // Phase 1: Deploy standalone contracts
    // ============================================
    function _phase1Deploy(address /*deployer*/) internal {
        console.log("--- Phase 1: Deploy Contracts ---");

        usdc = new MockUSDC();
        console.log("MockUSDC:", address(usdc));

        oracle = new MockOracle();
        console.log("MockOracle:", address(oracle));

        claimReceipt = new ClaimReceipt();
        console.log("ClaimReceipt:", address(claimReceipt));

        registry = new PolicyRegistry();
        console.log("PolicyRegistry:", address(registry));
    }

    // ============================================
    // Phase 2: Deploy factory + 8 vaults
    // ============================================
    function _phase2CreateVaults(address deployer) internal {
        console.log("");
        console.log("--- Phase 2: Deploy Factory + 8 Vaults ---");

        factory = new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt)
        );
        console.log("VaultFactory:", address(factory));

        claimReceipt.setRegistrar(address(factory));
        console.log("Factory set as ClaimReceipt registrar");

        _createVaultA(deployer);
        _createVaultB(deployer);
        _createVaultC(deployer);
        _createVaultD(deployer);
        _createVaultE(deployer);
        _createVaultF(deployer);
        _createVaultG(deployer);
        _createVaultH(deployer);

        console.log("ClaimReceipt minters auto-registered by factory");
    }

    function _createVaultA(address deployer) internal {
        vaultAAddr = factory.createVault("NextBlock Balanced Core", "nxbBAL", "Balanced Core", deployer, 2000, 50);
        console.log("Vault A (Balanced Core):", vaultAAddr);
    }

    function _createVaultB(address deployer) internal {
        vaultBAddr = factory.createVault("NextBlock Digital Asset Shield", "nxbDAS", "Digital Asset Shield", deployer, 2500, 100);
        console.log("Vault B (Digital Asset Shield):", vaultBAddr);
    }

    function _createVaultC(address deployer) internal {
        vaultCAddr = factory.createVault("NextBlock Parametric Shield", "nxbPARA", "Parametric Shield", deployer, 2500, 75);
        console.log("Vault C (Parametric Shield):", vaultCAddr);
    }

    function _createVaultD(address deployer) internal {
        vaultDAddr = factory.createVault("NextBlock Conservative Yield", "nxbCONS", "Conservative Yield", deployer, 3000, 25);
        console.log("Vault D (Conservative Yield):", vaultDAddr);
    }

    function _createVaultE(address deployer) internal {
        vaultEAddr = factory.createVault("NextBlock Catastrophe & Specialty", "nxbCATS", "Catastrophe & Specialty", deployer, 2000, 150);
        console.log("Vault E (Catastrophe & Specialty):", vaultEAddr);
    }

    function _createVaultF(address deployer) internal {
        vaultFAddr = factory.createVault("NextBlock Traditional Lines", "nxbTRAD", "Traditional Lines", deployer, 2500, 50);
        console.log("Vault F (Traditional Lines):", vaultFAddr);
    }

    function _createVaultG(address deployer) internal {
        vaultGAddr = factory.createVault("NextBlock Technology & Specialty", "nxbCYBR", "Technology & Specialty", deployer, 2000, 100);
        console.log("Vault G (Technology & Specialty):", vaultGAddr);
    }

    function _createVaultH(address deployer) internal {
        vaultHAddr = factory.createVault("NextBlock Multi-Line Diversified", "nxbMLTI", "Multi-Line Diversified", deployer, 2000, 75);
        console.log("Vault H (Multi-Line Diversified):", vaultHAddr);
    }

    // ============================================
    // Phase 2b: Seed deposits (before premiums to ensure share price starts at $1.00)
    // ============================================
    function _phase2bSeedDeposits(address deployer) internal {
        console.log("");
        console.log("--- Phase 2b: Seed Deposits ---");
        _seedDeposits(deployer);
    }

    // ============================================
    // Phase 3: Register + activate 13 policies
    // ============================================
    function _phase3RegisterPolicies(address deployer) internal {
        console.log("");
        console.log("--- Phase 3: Register 13 Policies ---");

        _registerOnChainPolicies(deployer);
        _registerOraclePolicies(deployer);
        _registerOffChainPolicies(deployer);
        _activateAllPolicies();
    }

    function _registerOnChainPolicies(address deployer) internal {
        p1 = registry.registerPolicy("BTC Price Protection", PolicyRegistry.VerificationType.ON_CHAIN, COVERAGE_P1, PREMIUM_P1, DURATION_P1, deployer, THRESHOLD_P1);
        console.log("P1  (BTC Price Protection) registered, id:", p1);

        p4 = registry.registerPolicy("ETH Crash Protection", PolicyRegistry.VerificationType.ON_CHAIN, COVERAGE_P4, PREMIUM_P4, DURATION_P4, deployer, THRESHOLD_P4);
        console.log("P4  (ETH Crash Protection) registered, id:", p4);

        p5 = registry.registerPolicy("BTC Catastrophe Cover", PolicyRegistry.VerificationType.ON_CHAIN, COVERAGE_P5, PREMIUM_P5, DURATION_P5, deployer, THRESHOLD_P5);
        console.log("P5  (BTC Catastrophe Cover) registered, id:", p5);

        p6 = registry.registerPolicy("Stablecoin Depeg Guard", PolicyRegistry.VerificationType.ON_CHAIN, COVERAGE_P6, PREMIUM_P6, DURATION_P6, deployer, THRESHOLD_P6);
        console.log("P6  (Stablecoin Depeg Guard) registered, id:", p6);
    }

    function _registerOraclePolicies(address deployer) internal {
        p2 = registry.registerPolicy("Flight Delay", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, COVERAGE_P2, PREMIUM_P2, DURATION_P2, deployer, 0);
        console.log("P2  (Flight Delay) registered, id:", p2);

        p7 = registry.registerPolicy("Hurricane Season Cover", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, COVERAGE_P7, PREMIUM_P7, DURATION_P7, deployer, 0);
        console.log("P7  (Hurricane Season Cover) registered, id:", p7);

        p8 = registry.registerPolicy("Earthquake Protection", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, COVERAGE_P8, PREMIUM_P8, DURATION_P8, deployer, 0);
        console.log("P8  (Earthquake Protection) registered, id:", p8);

        p9 = registry.registerPolicy("Drought Index", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, COVERAGE_P9, PREMIUM_P9, DURATION_P9, deployer, 0);
        console.log("P9  (Drought Index) registered, id:", p9);
    }

    function _registerOffChainPolicies(address deployer) internal {
        p3 = registry.registerPolicy("Commercial Fire", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_P3, PREMIUM_P3, DURATION_P3, deployer, 0);
        console.log("P3  (Commercial Fire) registered, id:", p3);

        p10 = registry.registerPolicy("Marine Cargo", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_P10, PREMIUM_P10, DURATION_P10, deployer, 0);
        console.log("P10 (Marine Cargo) registered, id:", p10);

        p11 = registry.registerPolicy("Professional Liability", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_P11, PREMIUM_P11, DURATION_P11, deployer, 0);
        console.log("P11 (Professional Liability) registered, id:", p11);

        p12 = registry.registerPolicy("Cyber Insurance", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_P12, PREMIUM_P12, DURATION_P12, deployer, 0);
        console.log("P12 (Cyber Insurance) registered, id:", p12);

        p13 = registry.registerPolicy("Equipment Breakdown", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_P13, PREMIUM_P13, DURATION_P13, deployer, 0);
        console.log("P13 (Equipment Breakdown) registered, id:", p13);
    }

    function _activateAllPolicies() internal {
        registry.activatePolicy(p1);
        registry.activatePolicy(p2);
        registry.activatePolicy(p3);
        registry.activatePolicy(p4);
        registry.activatePolicy(p5);
        registry.activatePolicy(p6);
        registry.activatePolicy(p7);
        registry.activatePolicy(p8);
        registry.activatePolicy(p9);
        registry.activatePolicy(p10);
        registry.activatePolicy(p11);
        registry.activatePolicy(p12);
        registry.activatePolicy(p13);
        console.log("All 13 policies activated");
    }

    // ============================================
    // Phase 4: Add policies to vaults + fund premiums
    // ============================================
    function _phase4AddPoliciesAndFund(address deployer) internal {
        console.log("");
        console.log("--- Phase 4: Add Policies + Fund Premiums ---");

        // Mint USDC for all premiums across all 8 vaults
        // A: 2500+1200+2400+8000+3600 = $17,700
        // B: 2500+1800+6000+3000 = $13,300
        // C: 1200+8000+4200+2000 = $15,400
        // D: 2400+3600+1750+3850 = $11,600
        // E: 6000+8000+4200+5600 = $23,800
        // F: 2400+3600+1750 = $7,750
        // G: 3000+5600+3850 = $12,450
        // H: 2500+1200+2400+8000+3600+5600 = $23,300
        // Total = $125,300
        uint256 totalPremiums = 125_300e6;
        usdc.mint(deployer, totalPremiums);
        console.log("Minted premium USDC:", totalPremiums);

        _addPoliciesAndFundVaultA();
        _addPoliciesAndFundVaultB();
        _addPoliciesAndFundVaultC();
        _addPoliciesAndFundVaultD();
        _addPoliciesAndFundVaultE();
        _addPoliciesAndFundVaultF();
        _addPoliciesAndFundVaultG();
        _addPoliciesAndFundVaultH();
    }

    function _addPoliciesAndFundVaultA() internal {
        InsuranceVault vault = InsuranceVault(vaultAAddr);
        // Vault A: P1, P2, P3, P7, P10 -- 5 policies, each 2000 BPS
        vault.addPolicy(p1,  2000);
        vault.addPolicy(p2,  2000);
        vault.addPolicy(p3,  2000);
        vault.addPolicy(p7,  2000);
        vault.addPolicy(p10, 2000);

        uint256 premiums = PREMIUM_P1 + PREMIUM_P2 + PREMIUM_P3 + PREMIUM_P7 + PREMIUM_P10;
        usdc.approve(vaultAAddr, premiums);
        vault.depositPremium(p1,  PREMIUM_P1);
        vault.depositPremium(p2,  PREMIUM_P2);
        vault.depositPremium(p3,  PREMIUM_P3);
        vault.depositPremium(p7,  PREMIUM_P7);
        vault.depositPremium(p10, PREMIUM_P10);
        console.log("Vault A: P1,P2,P3,P7,P10 (5x2000 BPS), premiums: $17,700");
    }

    function _addPoliciesAndFundVaultB() internal {
        InsuranceVault vault = InsuranceVault(vaultBAddr);
        // Vault B: P1, P4, P5, P6 -- 4 policies, each 2500 BPS
        vault.addPolicy(p1, 2500);
        vault.addPolicy(p4, 2500);
        vault.addPolicy(p5, 2500);
        vault.addPolicy(p6, 2500);

        uint256 premiums = PREMIUM_P1 + PREMIUM_P4 + PREMIUM_P5 + PREMIUM_P6;
        usdc.approve(vaultBAddr, premiums);
        vault.depositPremium(p1, PREMIUM_P1);
        vault.depositPremium(p4, PREMIUM_P4);
        vault.depositPremium(p5, PREMIUM_P5);
        vault.depositPremium(p6, PREMIUM_P6);
        console.log("Vault B: P1,P4,P5,P6 (4x2500 BPS), premiums: $13,300");
    }

    function _addPoliciesAndFundVaultC() internal {
        InsuranceVault vault = InsuranceVault(vaultCAddr);
        // Vault C: P2, P7, P8, P9 -- 4 policies, each 2500 BPS
        vault.addPolicy(p2, 2500);
        vault.addPolicy(p7, 2500);
        vault.addPolicy(p8, 2500);
        vault.addPolicy(p9, 2500);

        uint256 premiums = PREMIUM_P2 + PREMIUM_P7 + PREMIUM_P8 + PREMIUM_P9;
        usdc.approve(vaultCAddr, premiums);
        vault.depositPremium(p2, PREMIUM_P2);
        vault.depositPremium(p7, PREMIUM_P7);
        vault.depositPremium(p8, PREMIUM_P8);
        vault.depositPremium(p9, PREMIUM_P9);
        console.log("Vault C: P2,P7,P8,P9 (4x2500 BPS), premiums: $15,400");
    }

    function _addPoliciesAndFundVaultD() internal {
        InsuranceVault vault = InsuranceVault(vaultDAddr);
        // Vault D: P3, P10, P11, P13 -- 4 policies, each 2500 BPS
        vault.addPolicy(p3,  2500);
        vault.addPolicy(p10, 2500);
        vault.addPolicy(p11, 2500);
        vault.addPolicy(p13, 2500);

        uint256 premiums = PREMIUM_P3 + PREMIUM_P10 + PREMIUM_P11 + PREMIUM_P13;
        usdc.approve(vaultDAddr, premiums);
        vault.depositPremium(p3,  PREMIUM_P3);
        vault.depositPremium(p10, PREMIUM_P10);
        vault.depositPremium(p11, PREMIUM_P11);
        vault.depositPremium(p13, PREMIUM_P13);
        console.log("Vault D: P3,P10,P11,P13 (4x2500 BPS), premiums: $11,600");
    }

    function _addPoliciesAndFundVaultE() internal {
        InsuranceVault vault = InsuranceVault(vaultEAddr);
        // Vault E: P5, P7, P8, P12 -- 4 policies, each 2500 BPS
        vault.addPolicy(p5,  2500);
        vault.addPolicy(p7,  2500);
        vault.addPolicy(p8,  2500);
        vault.addPolicy(p12, 2500);

        uint256 premiums = PREMIUM_P5 + PREMIUM_P7 + PREMIUM_P8 + PREMIUM_P12;
        usdc.approve(vaultEAddr, premiums);
        vault.depositPremium(p5,  PREMIUM_P5);
        vault.depositPremium(p7,  PREMIUM_P7);
        vault.depositPremium(p8,  PREMIUM_P8);
        vault.depositPremium(p12, PREMIUM_P12);
        console.log("Vault E: P5,P7,P8,P12 (4x2500 BPS), premiums: $23,800");
    }

    function _addPoliciesAndFundVaultF() internal {
        InsuranceVault vault = InsuranceVault(vaultFAddr);
        // Vault F: P3, P10, P11 -- 3 policies: 3333, 3333, 3334 BPS
        vault.addPolicy(p3,  3333);
        vault.addPolicy(p10, 3333);
        vault.addPolicy(p11, 3334);

        uint256 premiums = PREMIUM_P3 + PREMIUM_P10 + PREMIUM_P11;
        usdc.approve(vaultFAddr, premiums);
        vault.depositPremium(p3,  PREMIUM_P3);
        vault.depositPremium(p10, PREMIUM_P10);
        vault.depositPremium(p11, PREMIUM_P11);
        console.log("Vault F: P3,P10,P11 (3333+3333+3334 BPS), premiums: $7,750");
    }

    function _addPoliciesAndFundVaultG() internal {
        InsuranceVault vault = InsuranceVault(vaultGAddr);
        // Vault G: P6, P12, P13 -- 3 policies: 3333, 3333, 3334 BPS
        vault.addPolicy(p6,  3333);
        vault.addPolicy(p12, 3333);
        vault.addPolicy(p13, 3334);

        uint256 premiums = PREMIUM_P6 + PREMIUM_P12 + PREMIUM_P13;
        usdc.approve(vaultGAddr, premiums);
        vault.depositPremium(p6,  PREMIUM_P6);
        vault.depositPremium(p12, PREMIUM_P12);
        vault.depositPremium(p13, PREMIUM_P13);
        console.log("Vault G: P6,P12,P13 (3333+3333+3334 BPS), premiums: $12,450");
    }

    function _addPoliciesAndFundVaultH() internal {
        InsuranceVault vault = InsuranceVault(vaultHAddr);
        // Vault H: P1, P2, P3, P7, P10, P12 -- 6 policies: 5x1666 + 1670 BPS
        vault.addPolicy(p1,  1666);
        vault.addPolicy(p2,  1666);
        vault.addPolicy(p3,  1666);
        vault.addPolicy(p7,  1666);
        vault.addPolicy(p10, 1666);
        vault.addPolicy(p12, 1670);

        uint256 premiums = PREMIUM_P1 + PREMIUM_P2 + PREMIUM_P3 + PREMIUM_P7 + PREMIUM_P10 + PREMIUM_P12;
        usdc.approve(vaultHAddr, premiums);
        vault.depositPremium(p1,  PREMIUM_P1);
        vault.depositPremium(p2,  PREMIUM_P2);
        vault.depositPremium(p3,  PREMIUM_P3);
        vault.depositPremium(p7,  PREMIUM_P7);
        vault.depositPremium(p10, PREMIUM_P10);
        vault.depositPremium(p12, PREMIUM_P12);
        console.log("Vault H: P1,P2,P3,P7,P10,P12 (5x1666+1670 BPS), premiums: $23,300");
    }

    // ============================================
    // Phase 5: Setup demo state
    // ============================================
    function _phase5DemoState(address deployer, address investor) internal {
        console.log("");
        console.log("--- Phase 5: Setup Demo State ---");

        _setVaultRoles(deployer);

        console.log("Oracle initialized: BTC=$85,000, flight=not delayed");

        // Mint USDC to investor ($50K)
        usdc.mint(investor, 50_000e6);
        console.log("Investor funded: $50,000 USDC");

        // Mint USDC to deployer for additional demos ($50K)
        usdc.mint(deployer, 50_000e6);
        console.log("Admin funded: $50,000 USDC");
    }

    function _setVaultRoles(address deployer) internal {
        InsuranceVault(vaultAAddr).setOracleReporter(deployer);
        InsuranceVault(vaultAAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultBAddr).setOracleReporter(deployer);
        InsuranceVault(vaultBAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultCAddr).setOracleReporter(deployer);
        InsuranceVault(vaultCAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultDAddr).setOracleReporter(deployer);
        InsuranceVault(vaultDAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultEAddr).setOracleReporter(deployer);
        InsuranceVault(vaultEAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultFAddr).setOracleReporter(deployer);
        InsuranceVault(vaultFAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultGAddr).setOracleReporter(deployer);
        InsuranceVault(vaultGAddr).setInsurerAdmin(deployer);
        InsuranceVault(vaultHAddr).setOracleReporter(deployer);
        InsuranceVault(vaultHAddr).setInsurerAdmin(deployer);
        console.log("All vault roles set (deployer = oracleReporter + insurerAdmin)");
    }

    function _seedDeposits(address deployer) internal {
        // Seed deposits ensure totalSupply > 0 at deploy, so share price starts at $1.0000
        uint256 seedA = 25_000e6;
        uint256 seedB = 50_000e6;
        uint256 seedC = 15_000e6;
        uint256 seedD = 30_000e6;
        uint256 seedE = 50_000e6;
        uint256 seedF = 20_000e6;
        uint256 seedG = 15_000e6;
        uint256 seedH = 25_000e6;
        uint256 totalSeed = seedA + seedB + seedC + seedD + seedE + seedF + seedG + seedH;

        usdc.mint(deployer, totalSeed);

        usdc.approve(vaultAAddr, seedA);
        InsuranceVault(vaultAAddr).deposit(seedA, deployer);
        console.log("Vault A seed deposit: $25,000");

        usdc.approve(vaultBAddr, seedB);
        InsuranceVault(vaultBAddr).deposit(seedB, deployer);
        console.log("Vault B seed deposit: $50,000");

        usdc.approve(vaultCAddr, seedC);
        InsuranceVault(vaultCAddr).deposit(seedC, deployer);
        console.log("Vault C seed deposit: $15,000");

        usdc.approve(vaultDAddr, seedD);
        InsuranceVault(vaultDAddr).deposit(seedD, deployer);
        console.log("Vault D seed deposit: $30,000");

        usdc.approve(vaultEAddr, seedE);
        InsuranceVault(vaultEAddr).deposit(seedE, deployer);
        console.log("Vault E seed deposit: $50,000");

        usdc.approve(vaultFAddr, seedF);
        InsuranceVault(vaultFAddr).deposit(seedF, deployer);
        console.log("Vault F seed deposit: $20,000");

        usdc.approve(vaultGAddr, seedG);
        InsuranceVault(vaultGAddr).deposit(seedG, deployer);
        console.log("Vault G seed deposit: $15,000");

        usdc.approve(vaultHAddr, seedH);
        InsuranceVault(vaultHAddr).deposit(seedH, deployer);
        console.log("Vault H seed deposit: $25,000");
    }

    // ============================================
    // Summary
    // ============================================
    function _printSummary(address deployer, address investor) internal view {
        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  MockUSDC:       ", address(usdc));
        console.log("  MockOracle:     ", address(oracle));
        console.log("  PolicyRegistry: ", address(registry));
        console.log("  ClaimReceipt:   ", address(claimReceipt));
        console.log("  VaultFactory:   ", address(factory));
        console.log("");
        console.log("Vaults:");
        console.log("  A (Balanced Core):           ", vaultAAddr);
        console.log("  B (Digital Asset Shield):    ", vaultBAddr);
        console.log("  C (Parametric Shield):       ", vaultCAddr);
        console.log("  D (Conservative Yield):      ", vaultDAddr);
        console.log("  E (Catastrophe & Specialty): ", vaultEAddr);
        console.log("  F (Traditional Lines):       ", vaultFAddr);
        console.log("  G (Technology & Specialty):  ", vaultGAddr);
        console.log("  H (Multi-Line Diversified):  ", vaultHAddr);
        console.log("");
        console.log("Policies (13):");
        console.log("  P1:  BTC Price Protection     (ON_CHAIN,   $50K,  90d)");
        console.log("  P2:  Flight Delay             (ORACLE,     $15K,  60d)");
        console.log("  P3:  Commercial Fire          (OFF_CHAIN,  $40K, 180d)");
        console.log("  P4:  ETH Crash Protection     (ON_CHAIN,   $30K,  90d)");
        console.log("  P5:  BTC Catastrophe Cover    (ON_CHAIN,  $100K, 180d)");
        console.log("  P6:  Stablecoin Depeg Guard   (ON_CHAIN,   $25K, 365d)");
        console.log("  P7:  Hurricane Season Cover   (ORACLE,     $80K, 180d)");
        console.log("  P8:  Earthquake Protection    (ORACLE,     $60K, 365d)");
        console.log("  P9:  Drought Index            (ORACLE,     $20K, 120d)");
        console.log("  P10: Marine Cargo             (OFF_CHAIN,  $45K,  90d)");
        console.log("  P11: Professional Liability   (OFF_CHAIN,  $35K, 365d)");
        console.log("  P12: Cyber Insurance          (OFF_CHAIN,  $70K, 180d)");
        console.log("  P13: Equipment Breakdown      (OFF_CHAIN,  $55K, 365d)");
        console.log("");
        console.log("Vault Allocations:");
        console.log("  A: P1,P2,P3,P7,P10        (5x2000 BPS)       seed $25K");
        console.log("  B: P1,P4,P5,P6            (4x2500 BPS)       seed $50K");
        console.log("  C: P2,P7,P8,P9            (4x2500 BPS)       seed $15K");
        console.log("  D: P3,P10,P11,P13         (4x2500 BPS)       seed $30K");
        console.log("  E: P5,P7,P8,P12           (4x2500 BPS)       seed $50K");
        console.log("  F: P3,P10,P11             (3333+3333+3334)   seed $20K");
        console.log("  G: P6,P12,P13             (3333+3333+3334)   seed $15K");
        console.log("  H: P1,P2,P3,P7,P10,P12   (5x1666+1670)      seed $25K");
        console.log("");
        console.log("Demo Wallets:");
        console.log("  Admin/Platform: ", deployer);
        console.log("  Investor:       ", investor);
    }
}
