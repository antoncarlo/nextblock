// =============================================================================
// Contract ABIs and addresses -- Generated from Foundry build output.
// Source: repo/contracts/out/ (forge build artifacts, Phases 1-12.1)
// Phase 9.5: legacy vault claim triggers (checkClaim/reportEvent/submitClaim/
// exerciseClaim) and oracleReporter/insurerAdmin bindings were REMOVED from
// InsuranceVault. Claims flow exclusively through ClaimManager.
// Phase 12.1: VaultFactory constructor takes vaultDeployer_ (EIP-170 split).
// Phase 10/12: NEXTBLOCK_LENS_ABI added — canonical read-only source for
// dashboards; addresses for Base Sepolia 84532 are the REAL staging deploy
// (deployments/84532-staging.json, broadcast 2026-06-10).
// DO NOT EDIT MANUALLY. Re-generate after contract changes.
// =============================================================================

// Base Sepolia 84532 addresses are consumed from the generated address book
// (single source of truth: contracts/deployments/84532-staging.json via
// npm run codegen:addressbook). Do not hardcode staging addresses here.
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from './generated/addressBook';

export const VAULT_FACTORY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "asset_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyRegistry_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "oracle_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "claimReceipt_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "complianceRegistry_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vaultDeployer_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "asset",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimReceiptAddr",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "complianceRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createVault",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "vaultName",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "vaultManager_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "bufferRatioBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "managementFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deployedVaults",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaults",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isVault",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "oracle",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vaultDeployer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract VaultDeployer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultCreated",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "vaultName",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "vaultManager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bufferRatioBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "managementFeeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultFactory__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VaultFactory__ManagerNotCurator",
    "inputs": [
      {
        "name": "manager",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultFactory__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const INSURANCE_VAULT_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct InsuranceVault.VaultInitParams",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "contract IERC20"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "symbol",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "vaultName",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bufferRatioBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "managementFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "registry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "oracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "claimReceipt",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "protocolRoles",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "complianceRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "portfolioRegistry",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "BASIS_POINTS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_MANAGEMENT_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_BUFFER_RATIO_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SECONDS_PER_YEAR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNCAPPED",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "accumulatedFees",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "addPolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "weightBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allocateToPortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "asset",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "authorizedPremiumDepositors",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bufferRatioBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimFees",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimReceipt",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ClaimReceipt"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "complianceRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IComplianceRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "convertToAssets",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "convertToShares",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deallocateFromPortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "depositCap",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "depositPremium",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAllocatedPortfolios",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPolicyIds",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultAccounting",
    "inputs": [],
    "outputs": [
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "unearnedPremiums",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "pendingClaims",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deployedCapital",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "portfolioAllocated",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "availableBuffer",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "capacity",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultInfo",
    "inputs": [],
    "outputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "manager",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sharePrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bufferBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "feeBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "availableBuffer",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deployedCapital",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "policyCount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultPolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "allocationWeight",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premium",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "earnedPremium",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "coverage",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "duration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "startTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "timeRemaining",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "expired",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastFeeTimestamp",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "managementFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxDeposit",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxMint",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxRedeem",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxWithdraw",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "oracle",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract MockOracle"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "payPortfolioClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "policyAdded",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policyIds",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioAllocation",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioPremium",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewDeposit",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewMint",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewRedeem",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewWithdraw",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recordPortfolioPremium",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "redeem",
    "inputs": [
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PolicyRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "releasePortfolioClaimReserve",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reservePortfolioClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAuthorizedPremiumDepositor",
    "inputs": [
      {
        "name": "depositor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "authorized",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setClaimManager",
    "inputs": [
      {
        "name": "claimManager_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDepositCap",
    "inputs": [
      {
        "name": "newCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setVaultAllocator",
    "inputs": [
      {
        "name": "vaultAllocator_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalAllocationWeight",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalAssets",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalDeployedCapital",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalPendingClaims",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalPortfolioAllocated",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "underwritingCapacity",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultAllocator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultName",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultPolicies",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "allocationWeight",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premiumDeposited",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "coverageAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "claimAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimManagerUpdated",
    "inputs": [
      {
        "name": "claimManager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposit",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DepositCapUpdated",
    "inputs": [
      {
        "name": "newCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeesCollected",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyAdded",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "allocationWeight",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyExpired",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioAllocated",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalForPortfolio",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioClaimPaid",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioClaimReserveReleased",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioClaimReserved",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "allocationReleased",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioDeallocated",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "totalForPortfolio",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioPremiumRecorded",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumDeposited",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumDepositorUpdated",
    "inputs": [
      {
        "name": "depositor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "authorized",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultAllocatorUpdated",
    "inputs": [
      {
        "name": "vaultAllocator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdraw",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "receiver",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shares",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC4626ExceededMaxDeposit",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC4626ExceededMaxMint",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC4626ExceededMaxRedeem",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "shares",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC4626ExceededMaxWithdraw",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assets",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "max",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__AllocationExceedsCapacity",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "capacity",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__AllocationExceedsCoverage",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "coverageLimit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__ClaimReserveInsufficientFunds",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "freeFunds",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__ClaimReserveUnderflow",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reserved",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__DeallocationExceedsAllocation",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "allocated",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__InsufficientBuffer",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsuranceVault__NoFeesToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsuranceVault__NotClaimManager",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__NotVaultAllocator",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__PolicyAlreadyAdded",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__PolicyNotActive",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__PolicyNotInVault",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__PortfolioNotAllocatable",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsuranceVault__UnauthorizedCaller",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const POLICY_REGISTRY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activatePolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "advanceTime",
    "inputs": [
      {
        "name": "secondsToAdd",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "currentTime",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPolicy",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PolicyRegistry.Policy",
        "components": [
          {
            "name": "id",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "verificationType",
            "type": "uint8",
            "internalType": "enum PolicyRegistry.VerificationType"
          },
          {
            "name": "coverageAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "premiumAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "duration",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "startTime",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "insurer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "triggerThreshold",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum PolicyRegistry.PolicyStatus"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPolicyCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRemainingDuration",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isPolicyExpired",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextPolicyId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "policies",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "verificationType",
        "type": "uint8",
        "internalType": "enum PolicyRegistry.VerificationType"
      },
      {
        "name": "coverageAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premiumAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "duration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "startTime",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "insurer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "triggerThreshold",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum PolicyRegistry.PolicyStatus"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerPolicy",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "verificationType",
        "type": "uint8",
        "internalType": "enum PolicyRegistry.VerificationType"
      },
      {
        "name": "coverageAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premiumAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "duration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "insurer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "triggerThreshold",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "outputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "timeOffset",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyActivated",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "startTime",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PolicyRegistered",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "verificationType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PolicyRegistry.VerificationType"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TimeAdvanced",
    "inputs": [
      {
        "name": "newTimestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "secondsAdded",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PolicyRegistry__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PolicyRegistry__InvalidStatus",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum PolicyRegistry.PolicyStatus"
      },
      {
        "name": "expected",
        "type": "uint8",
        "internalType": "enum PolicyRegistry.PolicyStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "PolicyRegistry__PolicyNotFound",
    "inputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PolicyRegistry__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const MOCK_USDC_ABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transfer",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "spender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InvalidSpender",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const MOCK_ORACLE_ABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "btcPrice",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "flightDelayed",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBtcPrice",
    "inputs": [],
    "outputs": [
      {
        "name": "price",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "updatedAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getFlightStatus",
    "inputs": [],
    "outputs": [
      {
        "name": "delayed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "updatedAt",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastBtcUpdate",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastFlightUpdate",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBtcPrice",
    "inputs": [
      {
        "name": "price",
        "type": "int256",
        "internalType": "int256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFlightStatus",
    "inputs": [
      {
        "name": "delayed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "BtcPriceUpdated",
    "inputs": [
      {
        "name": "price",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlightStatusUpdated",
    "inputs": [
      {
        "name": "delayed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "MockOracle__InvalidPrice",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const CLAIM_RECEIPT_ABI = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "authorizedMinters",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getApproved",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getReceipt",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ClaimReceipt.Receipt",
        "components": [
          {
            "name": "policyId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "claimAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "insurer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "timestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "exercised",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isApprovedForAll",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markExercised",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "mint",
    "inputs": [
      {
        "name": "insurer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextReceiptId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ownerOf",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "receipts",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "policyId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "insurer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "timestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "exercised",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registrar",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "safeTransferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setApprovalForAll",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAuthorizedMinter",
    "inputs": [
      {
        "name": "minter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "authorized",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRegistrar",
    "inputs": [
      {
        "name": "registrar_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tokenURI",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferFrom",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ApprovalForAll",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "operator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approved",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MinterUpdated",
    "inputs": [
      {
        "name": "minter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "authorized",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReceiptExercised",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReceiptMinted",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "insurer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "policyId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "claimAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RegistrarUpdated",
    "inputs": [
      {
        "name": "registrar",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ClaimReceipt__AlreadyExercised",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimReceipt__NonTransferable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimReceipt__OnlyIssuingVault",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimReceipt__ReceiptNotFound",
    "inputs": [
      {
        "name": "receiptId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimReceipt__UnauthorizedMinter",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimReceipt__UnauthorizedRegistrar",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721IncorrectOwner",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InsufficientApproval",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidApprover",
    "inputs": [
      {
        "name": "approver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOperator",
    "inputs": [
      {
        "name": "operator",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidReceiver",
    "inputs": [
      {
        "name": "receiver",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721InvalidSender",
    "inputs": [
      {
        "name": "sender",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC721NonexistentToken",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableInvalidOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OwnableUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const PROTOCOL_ROLES_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requireRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProtocolRoles__ZeroAddress",
    "inputs": []
  }
] as const;

export const COMPLIANCE_REGISTRY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "blocked",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canReceive",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canTransfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "investorLimit",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isBlocked",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "jurisdictionCode",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "kycExpiry",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requireCanReceive",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "requireCanTransfer",
    "inputs": [
      {
        "name": "from",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setBlocked",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "blocked_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setInvestorLimit",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setJurisdiction",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "code",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setKycExpiry",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setWhitelist",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "whitelisted",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "BlockedStatusUpdated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "blocked",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "InvestorLimitUpdated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "limit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JurisdictionUpdated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "code",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "KycExpiryUpdated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WhitelistUpdated",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "allowed",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ComplianceRegistry__AddressBlocked",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComplianceRegistry__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ComplianceRegistry__KycExpired",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComplianceRegistry__ReceiverNotWhitelisted",
    "inputs": [
      {
        "name": "user",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ComplianceRegistry__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const PORTFOLIO_REGISTRY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activatePortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "approvePortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expectedLossBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PortfolioRegistry.Portfolio",
        "components": [
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "cedant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "documentHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "lineOfBusiness",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "jurisdiction",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "structureType",
            "type": "uint8",
            "internalType": "enum PortfolioRegistry.StructureType"
          },
          {
            "name": "coverageLimit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "cededPremium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedLossBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "inceptionTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "expiryTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum PortfolioRegistry.PortfolioStatus"
          },
          {
            "name": "submittedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPortfolioCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPortfoliosByCedant",
    "inputs": [
      {
        "name": "cedant",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAllocatable",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markExpired",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextPortfolioId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pausePortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rejectPortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "startReview",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitPortfolio",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct PortfolioRegistry.SubmissionParams",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "documentHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "lineOfBusiness",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "jurisdiction",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "structureType",
            "type": "uint8",
            "internalType": "enum PortfolioRegistry.StructureType"
          },
          {
            "name": "coverageLimit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "cededPremium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "inceptionTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "expiryTime",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unpausePortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateMetadata",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "metadataURI",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "documentHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "PortfolioActivated",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "curator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioApproved",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "curator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "expectedLossBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioExpired",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioMetadataUpdated",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "metadataURI",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "documentHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioPaused",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioRejected",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "curator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioReviewStarted",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "curator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioSubmitted",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "cedant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "structureType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PortfolioRegistry.StructureType"
      },
      {
        "name": "coverageLimit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "cededPremium",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "inceptionTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "expiryTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioUnpaused",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__InvalidLossBps",
    "inputs": [
      {
        "name": "expectedLossBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__InvalidStatus",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum PortfolioRegistry.PortfolioStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__NotCedantOfPortfolio",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__NotFound",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__NotYetExpired",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiryTime",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "PortfolioRegistry__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const PREMIUM_DISTRIBUTOR_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "usdc_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "BASIS_POINTS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_PROTOCOL_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_UNDERWRITING_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_PROTOCOL_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_UNDERWRITING_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "accruedProtocolFees",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "accruedUnderwritingFees",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimProtocolFees",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimUnderwritingFees",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPremiumAccounting",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PremiumDistributor.PremiumAccounting",
        "components": [
          {
            "name": "gross",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lpQuota",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "protocolFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingFees",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioVault",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "premiumAccounting",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "gross",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "lpQuota",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "protocolFees",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "underwritingFees",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewSplit",
    "inputs": [
      {
        "name": "grossAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "lpQuota",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "protocolFee",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "underwritingFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "receivePremium",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "grossAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPortfolioVault",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPremiumSplit",
    "inputs": [
      {
        "name": "protocolFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "underwritingFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "totalGrossReceived",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "underwritingFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PortfolioVaultSet",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumAllocated",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lpQuota",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumReceived",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "grossAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PremiumSplitUpdated",
    "inputs": [
      {
        "name": "protocolFeeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "underwritingFeeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeeAccrued",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolFeesClaimed",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "UnderwritingFeeAccrued",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "UnderwritingFeesClaimed",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "PremiumDistributor__FeeAboveMax",
    "inputs": [
      {
        "name": "requestedBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PremiumDistributor__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PremiumDistributor__NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PremiumDistributor__PortfolioNotAllocatable",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PremiumDistributor__UnauthorizedPremiumSource",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "PremiumDistributor__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "PremiumDistributor__VaultChangeAfterFunding",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "PremiumDistributor__VaultNotSet",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;

export const NAV_ORACLE_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_MAX_DEVIATION_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_MAX_STALENESS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_MIN_CONFIDENCE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEVIATION_CEILING_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "STALENESS_CEILING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "STALENESS_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acknowledgeDeviation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deviationWaiver",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getNav",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "nav",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "updatedAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPortfolioRisk",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "riskScoreBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "updatedAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxDeviationBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxStaleness",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minConfidenceBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pauseFeed",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "publishNav",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "nav",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "publishPortfolioRisk",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "riskScoreBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rawNavAttestation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct NavOracle.NavAttestation",
        "components": [
          {
            "name": "nav",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setGuards",
    "inputs": [
      {
        "name": "maxStaleness_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxDeviationBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minConfidenceBps_",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "tryGetNav",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "valid",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "att",
        "type": "tuple",
        "internalType": "struct NavOracle.NavAttestation",
        "components": [
          {
            "name": "nav",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tryGetPortfolioRisk",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "valid",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "att",
        "type": "tuple",
        "internalType": "struct NavOracle.RiskAttestation",
        "components": [
          {
            "name": "riskScoreBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unpauseFeed",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "vaultAnomalyFlagged",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultFeedPaused",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "DeviationAcknowledged",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeedPaused",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeedUnpaused",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "GuardsUpdated",
    "inputs": [
      {
        "name": "maxStaleness",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "maxDeviationBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minConfidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NavAnomalyDetected",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "attemptedNav",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "lastAcceptedNav",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "deviationBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NavPublished",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "nav",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PortfolioRiskPublished",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "riskScoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "NavOracle__ConfidenceTooLow",
    "inputs": [
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minConfidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__FeedPaused",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NavOracle__NoAttestation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__NoRiskAttestation",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__ScoreOutOfBounds",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__StaleNav",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "updatedAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxStaleness",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__StaleRisk",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "updatedAt",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "maxStaleness",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "NavOracle__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const VAULT_ALLOCATOR_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "navOracle_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "BASIS_POINTS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_MAX_CEDANT_CONCENTRATION_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_MAX_PORTFOLIO_CONCENTRATION_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_PROPOSAL_TTL",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEMO_WEIGHT_A_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEMO_WEIGHT_B_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROPOSAL_TTL_CEILING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PROPOSAL_TTL_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cedantExposure",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "cedant",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "exposure",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeAllocation",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getProposal",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct VaultAllocator.AllocationProposal",
        "components": [
          {
            "name": "proposalId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "isDeallocation",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "proposer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "proposedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "expiresAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum VaultAllocator.ProposalStatus"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProposalCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "investableBase",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markExpired",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "maxCedantConcentrationBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxPortfolioConcentrationBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "navOracle",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract NavOracle"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextProposalId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposalTtl",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposeAllocation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "proposeDeallocation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "proposeDemoSeventyThirty",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioA",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "portfolioB",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "proposalIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "proposeSplitAllocation",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "weightsBps",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "totalAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "proposalIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setConcentrationLimits",
    "inputs": [
      {
        "name": "maxPortfolioBps",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxCedantBps",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setNavOracle",
    "inputs": [
      {
        "name": "navOracle_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProposalTtl",
    "inputs": [
      {
        "name": "ttl",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AllocationCancelled",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AllocationExecuted",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "executor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AllocationExpired",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AllocationProposed",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "isDeallocation",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "proposer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "expiresAt",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConcentrationLimitsUpdated",
    "inputs": [
      {
        "name": "maxPortfolioBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxCedantBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NavOracleSet",
    "inputs": [
      {
        "name": "navOracle",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProposalTtlUpdated",
    "inputs": [
      {
        "name": "ttl",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "VaultAllocator__CedantConcentrationExceeded",
    "inputs": [
      {
        "name": "cedant",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "wouldBe",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VaultAllocator__OracleBlocked",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__PortfolioConcentrationExceeded",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "wouldBe",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__PortfolioNotAllocatable",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__ProposalExpired",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__ProposalNotExpired",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiresAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__ProposalNotFound",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__ProposalNotPending",
    "inputs": [
      {
        "name": "proposalId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum VaultAllocator.ProposalStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__UnauthorizedCanceller",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "VaultAllocator__WeightsMismatch",
    "inputs": []
  }
] as const;

export const CLAIM_MANAGER_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "aiAssessor_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "claimReceipt_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_DISPUTE_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DISPUTE_WINDOW_CEILING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DISPUTE_WINDOW_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "aiAssessor",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract AIAssessor"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approveClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "approvedAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "attachAssessment",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimReceipt",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ClaimReceipt"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "disputeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "disputeWindow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "executeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "freezeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct ClaimManager.Claim",
        "components": [
          {
            "name": "claimId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "claimant",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "requestedAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "approvedAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "claimType",
            "type": "uint8",
            "internalType": "enum ClaimManager.ClaimType"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum ClaimManager.ClaimStatus"
          },
          {
            "name": "evidenceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "submittedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "challengeDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "frozen",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "receiptId",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getClaimCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextClaimId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rejectClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "uphold",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDisputeWindow",
    "inputs": [
      {
        "name": "window",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitClaim",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "claimType",
        "type": "uint8",
        "internalType": "enum ClaimManager.ClaimType"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "unfreezeClaim",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ClaimAnomalyFlagged",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "anomalyScoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimApproved",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "committee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "approvedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "receiptId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimAssessed",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "recommendation",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AIAssessor.Recommendation"
      },
      {
        "name": "scoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "anomalyScoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimDisputeResolved",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "committee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "upheld",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimDisputed",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimFrozen",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimPaid",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "receiptId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimRejected",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "committee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimSubmitted",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "claimant",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "requestedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "claimType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum ClaimManager.ClaimType"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "challengeDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ClaimUnfrozen",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DisputeWindowUpdated",
    "inputs": [
      {
        "name": "window",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ClaimManager__AmountExceedsCoverage",
    "inputs": [
      {
        "name": "requested",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "coverageLimit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__ApprovedAmountInvalid",
    "inputs": [
      {
        "name": "approvedAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requestedAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__AssessmentMissing",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__ClaimFrozenError",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__ClaimNotFound",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__DisputeWindowActive",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "challengeDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ClaimManager__InvalidStatus",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ClaimManager.ClaimStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__NotPortfolioCedant",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__PortfolioNotClaimable",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ClaimManager__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  }
] as const;

export const AI_ASSESSOR_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ANOMALY_THRESHOLD_FLOOR_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ANOMALY_THRESHOLD_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "anomalyThresholdBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAssessment",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AIAssessor.Assessment",
        "components": [
          {
            "name": "scoreBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "anomalyScoreBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "recommendation",
            "type": "uint8",
            "internalType": "enum AIAssessor.Recommendation"
          },
          {
            "name": "recommendedAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "assessedAt",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hasAssessment",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAnomalous",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "publishAssessment",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "scoreBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "anomalyScoreBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "recommendation",
        "type": "uint8",
        "internalType": "enum AIAssessor.Recommendation"
      },
      {
        "name": "recommendedAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setAnomalyThreshold",
    "inputs": [
      {
        "name": "thresholdBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AnomalyThresholdUpdated",
    "inputs": [
      {
        "name": "thresholdBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AssessmentPublished",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "scoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "anomalyScoreBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "recommendation",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum AIAssessor.Recommendation"
      },
      {
        "name": "recommendedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "sourceHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AIAssessor__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AIAssessor__NoAssessment",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AIAssessor__ScoreOutOfBounds",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AIAssessor__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const BORDEREAU_ORACLE_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioRegistry_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_LIVENESS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LIVENESS_CEILING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LIVENESS_FLOOR",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "disputeAssertion",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "finalizeAssertion",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAssertion",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct BordereauOracle.Assertion",
        "components": [
          {
            "name": "assertionId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "assertionType",
            "type": "uint8",
            "internalType": "enum BordereauOracle.AssertionType"
          },
          {
            "name": "dataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "dataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "declaredAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "disputer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "proposedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "livenessDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum BordereauOracle.AssertionStatus"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAssertionCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isFinalized",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "latestFinalized",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "internalType": "enum BordereauOracle.AssertionType"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct BordereauOracle.Assertion",
        "components": [
          {
            "name": "assertionId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "assertionType",
            "type": "uint8",
            "internalType": "enum BordereauOracle.AssertionType"
          },
          {
            "name": "dataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "dataURI",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "declaredAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "disputer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "proposedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "livenessDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum BordereauOracle.AssertionStatus"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liveness",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextAssertionId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "portfolioRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PortfolioRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proposeAssertion",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "internalType": "enum BordereauOracle.AssertionType"
      },
      {
        "name": "dataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "dataURI",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "declaredAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "uphold",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setLiveness",
    "inputs": [
      {
        "name": "liveness_",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AssertionDisputeResolved",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "committee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "upheld",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AssertionDisputed",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "sentinel",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "reason",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AssertionFinalized",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum BordereauOracle.AssertionType"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AssertionProposed",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum BordereauOracle.AssertionType"
      },
      {
        "name": "dataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "declaredAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "proposer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "livenessDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AssertionRejected",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LivenessUpdated",
    "inputs": [
      {
        "name": "liveness",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BordereauOracle__AssertionNotFound",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BordereauOracle__InvalidStatus",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum BordereauOracle.AssertionStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__LivenessActive",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "livenessDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__LivenessElapsed",
    "inputs": [
      {
        "name": "assertionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "livenessDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__NoFinalizedAssertion",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "internalType": "enum BordereauOracle.AssertionType"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__UnauthorizedProposer",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "BordereauOracle__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

export const ADAPTER_REGISTRY_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activateAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deprecateAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "disableAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct AdapterRegistry.Adapter",
        "components": [
          {
            "name": "adapterId",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "adapter",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "metadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "exposureCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum AdapterRegistry.AdapterStatus"
          },
          {
            "name": "registeredAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAdapterCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAdapterIds",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAdapterActive",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "registerAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "adapter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "exposureCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setExposureCap",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "exposureCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMetadata",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AdapterActivated",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdapterDeprecated",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdapterDisabled",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdapterExposureCapUpdated",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "exposureCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdapterMetadataUpdated",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdapterRegistered",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "adapter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "exposureCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AdapterRegistry__AdapterNotFound",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AdapterRegistry__DuplicateAdapter",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "AdapterRegistry__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AdapterRegistry__InvalidStatus",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum AdapterRegistry.AdapterStatus"
      }
    ]
  },
  {
    "type": "error",
    "name": "AdapterRegistry__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;
// =============================================================================
// NextBlockLens (Phase 10) — canonical READ-ONLY source for dashboards.
// Never-reverting get* views; DataStatus/DataSource enums match on-chain.
// =============================================================================

export const NEXTBLOCK_LENS_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "protocolRoles_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "modules_",
        "type": "tuple",
        "internalType": "struct NextBlockLens.ModuleAddresses",
        "components": [
          {
            "name": "portfolioRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "complianceRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultFactory",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "premiumDistributor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "navOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultAllocator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "claimManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "aiAssessor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bordereauOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "adapterRegistry",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ALLOCATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "AUTHORIZED_CEDANT_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CLAIMS_COMMITTEE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "KYC_OPERATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "LENS_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ORACLE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OWNER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PREMIUM_DEPOSITOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SCHEMA_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SENTINEL_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UNDERWRITING_CURATOR_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VAULT_FACTORY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getAdapterDashboard",
    "inputs": [
      {
        "name": "adapterId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.AdapterDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "adapter",
            "type": "tuple",
            "internalType": "struct AdapterRegistry.Adapter",
            "components": [
              {
                "name": "adapterId",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "adapter",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "name",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "metadataHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "exposureCap",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum AdapterRegistry.AdapterStatus"
              },
              {
                "name": "registeredAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "updatedAt",
                "type": "uint64",
                "internalType": "uint64"
              }
            ]
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBordereauDashboard",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assertionType",
        "type": "uint8",
        "internalType": "enum BordereauOracle.AssertionType"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.BordereauDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "latestFinalized",
            "type": "tuple",
            "internalType": "struct BordereauOracle.Assertion",
            "components": [
              {
                "name": "assertionId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "portfolioId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "assertionType",
                "type": "uint8",
                "internalType": "enum BordereauOracle.AssertionType"
              },
              {
                "name": "dataHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "dataURI",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "declaredAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "proposer",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "disputer",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "proposedAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "livenessDeadline",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum BordereauOracle.AssertionStatus"
              }
            ]
          },
          {
            "name": "liveness",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "assertionCount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getClaimDashboard",
    "inputs": [
      {
        "name": "claimId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.ClaimDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "claim",
            "type": "tuple",
            "internalType": "struct ClaimManager.Claim",
            "components": [
              {
                "name": "claimId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "portfolioId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vault",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "claimant",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "requestedAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "approvedAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "claimType",
                "type": "uint8",
                "internalType": "enum ClaimManager.ClaimType"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum ClaimManager.ClaimStatus"
              },
              {
                "name": "evidenceHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "submittedAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "challengeDeadline",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "frozen",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "receiptId",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "disputeWindow",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "disputeWindowElapsed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "hasAssessment",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "assessmentSource",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataSource"
          },
          {
            "name": "assessment",
            "type": "tuple",
            "internalType": "struct AIAssessor.Assessment",
            "components": [
              {
                "name": "scoreBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "anomalyScoreBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "confidenceBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "recommendation",
                "type": "uint8",
                "internalType": "enum AIAssessor.Recommendation"
              },
              {
                "name": "recommendedAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "sourceHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "assessedAt",
                "type": "uint64",
                "internalType": "uint64"
              }
            ]
          },
          {
            "name": "anomalous",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getLPStatus",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lp",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.LPStatusView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "complianceStatus",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "vaultStatus",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "lp",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "whitelisted",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "blocked",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "kycExpiry",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "kycExpired",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "jurisdictionCode",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "canReceive",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "shareBalance",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "assetValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxDeposit",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxWithdraw",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxRedeem",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "redemptionEligible",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOracleDashboard",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.OracleDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "source",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataSource"
          },
          {
            "name": "nav",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "updatedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "feedPaused",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "anomalyFlagged",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "deviationWaiver",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "maxStaleness",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxDeviationBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "minConfidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPortfolioStatus",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.PortfolioStatusView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "portfolio",
            "type": "tuple",
            "internalType": "struct PortfolioRegistry.Portfolio",
            "components": [
              {
                "name": "portfolioId",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "cedant",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "name",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "metadataURI",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "documentHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "lineOfBusiness",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "jurisdiction",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "structureType",
                "type": "uint8",
                "internalType": "enum PortfolioRegistry.StructureType"
              },
              {
                "name": "coverageLimit",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "cededPremium",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "expectedLossBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "inceptionTime",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "expiryTime",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "status",
                "type": "uint8",
                "internalType": "enum PortfolioRegistry.PortfolioStatus"
              },
              {
                "name": "submittedAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "updatedAt",
                "type": "uint64",
                "internalType": "uint64"
              }
            ]
          },
          {
            "name": "allocatable",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "allocatedExposure",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "premiumRecorded",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "riskStatus",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "riskSource",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataSource"
          },
          {
            "name": "riskScoreBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "riskConfidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "riskUpdatedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "riskSourceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPremiumDashboard",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.PremiumDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gross",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lpQuota",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "protocolFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "protocolFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalGrossReceived",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accruedProtocolFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accruedUnderwritingFees",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getProtocolStatus",
    "inputs": [],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.ProtocolStatusView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "lensVersion",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "chainId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "modules",
            "type": "tuple",
            "internalType": "struct NextBlockLens.ModuleAddresses",
            "components": [
              {
                "name": "portfolioRegistry",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "complianceRegistry",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "vaultFactory",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "premiumDistributor",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "navOracle",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "vaultAllocator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "claimManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "aiAssessor",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "bordereauOracle",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "adapterRegistry",
                "type": "address",
                "internalType": "address"
              }
            ]
          },
          {
            "name": "vaultCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "claimCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "assertionCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "adapterCount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "proposalCount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getVaultDashboard",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.VaultDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "totalAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalShares",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sharePrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "balance",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "unearnedPremiums",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pendingClaims",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deployedCapital",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioAllocated",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "availableBuffer",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingCapacity",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "depositCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bufferRatioBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "managementFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accumulatedFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "boundClaimManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "boundVaultAllocator",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "modules",
    "inputs": [],
    "outputs": [
      {
        "name": "portfolioRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "complianceRegistry",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vaultFactory",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "premiumDistributor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "navOracle",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vaultAllocator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "claimManager",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "aiAssessor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "bordereauOracle",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "adapterRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolRoles",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolRoles"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rawLPCompliance",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "whitelisted_",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "blocked_",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "kycExpiry_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "jurisdiction_",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "canReceive_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rawLPPosition",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lp",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "shares_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "assets_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDeposit_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxWithdraw_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxRedeem_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rawPortfolioExposure",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "exposure_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "premium_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rawPremiumDashboard",
    "inputs": [
      {
        "name": "portfolioId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.PremiumDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "portfolioId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gross",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lpQuota",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "protocolFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "protocolFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalGrossReceived",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accruedProtocolFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accruedUnderwritingFees",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "rawVaultDashboard",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct NextBlockLens.VaultDashboardView",
        "components": [
          {
            "name": "schemaVersion",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum NextBlockLens.DataStatus"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "manager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "totalAssets",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalShares",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sharePrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "balance",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "unearnedPremiums",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "pendingClaims",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "deployedCapital",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "portfolioAllocated",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "availableBuffer",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "underwritingCapacity",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "depositCap",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bufferRatioBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "managementFeeBps",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "accumulatedFees",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "boundClaimManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "boundVaultAllocator",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setModules",
    "inputs": [
      {
        "name": "modules_",
        "type": "tuple",
        "internalType": "struct NextBlockLens.ModuleAddresses",
        "components": [
          {
            "name": "portfolioRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "complianceRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultFactory",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "premiumDistributor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "navOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultAllocator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "claimManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "aiAssessor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bordereauOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "adapterRegistry",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "ModulesUpdated",
    "inputs": [
      {
        "name": "modules",
        "type": "tuple",
        "indexed": false,
        "internalType": "struct NextBlockLens.ModuleAddresses",
        "components": [
          {
            "name": "portfolioRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "complianceRegistry",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultFactory",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "premiumDistributor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "navOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vaultAllocator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "claimManager",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "aiAssessor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "bordereauOracle",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "adapterRegistry",
            "type": "address",
            "internalType": "address"
          }
        ]
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "NextBlockLens__InvalidParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NextBlockLens__UnauthorizedRole",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  }
] as const;

// =============================================================================
// Deployed contract addresses per chain.
//
// LEGACY DEMO deployments (pre Phase 1-8 hardening): the institutional module
// addresses below are ZERO until the new protocol stack is deployed
// (Phase 9.5 deployment readiness). The UI MUST treat zero addresses as
// "Unavailable" -- never fall back to fake data.
// =============================================================================

export type ChainAddresses = {
  vaultFactory: `0x${string}`;
  policyRegistry: `0x${string}`;
  mockUSDC: `0x${string}`;
  mockOracle: `0x${string}`;
  claimReceipt: `0x${string}`;
  // Institutional protocol modules (Phases 1-8). ZERO = not yet deployed.
  protocolRoles: `0x${string}`;
  complianceRegistry: `0x${string}`;
  portfolioRegistry: `0x${string}`;
  premiumDistributor: `0x${string}`;
  navOracle: `0x${string}`;
  vaultAllocator: `0x${string}`;
  claimManager: `0x${string}`;
  aiAssessor: `0x${string}`;
  bordereauOracle: `0x${string}`;
  adapterRegistry: `0x${string}`;
  // Phase 10/12.1 modules
  nextBlockLens: `0x${string}`;
  vaultDeployer: `0x${string}`;
};

const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`;

const ZERO_MODULES = {
  protocolRoles: ZERO,
  complianceRegistry: ZERO,
  portfolioRegistry: ZERO,
  premiumDistributor: ZERO,
  navOracle: ZERO,
  vaultAllocator: ZERO,
  claimManager: ZERO,
  aiAssessor: ZERO,
  bordereauOracle: ZERO,
  adapterRegistry: ZERO,
  nextBlockLens: ZERO,
  vaultDeployer: ZERO,
} as const;

export const ZERO_ADDRESSES: ChainAddresses = {
  vaultFactory: ZERO,
  policyRegistry: ZERO,
  mockUSDC: ZERO,
  mockOracle: ZERO,
  claimReceipt: ZERO,
  ...ZERO_MODULES,
};

/** True when an address is configured (non-zero) on the current chain. */
export function isDeployed(address: `0x${string}` | undefined): boolean {
  return !!address && address !== ZERO;
}

export const CHAIN_ADDRESSES: Record<number, ChainAddresses> = {
  // Anvil local (LEGACY DEMO deploy - 2026-02-06; institutional modules not deployed)
  31337: {
    vaultFactory: '0xd71A4331A1c97E82e9c3b75F71a1ed64bFB1bFCD',
    policyRegistry: '0x2cBDD9C4d978A3DA2Abd399E63fdDb94eC242126',
    mockUSDC: '0xd3D94fde19686Eb128Da9f994Fc9Fe78ABf521Aa',
    mockOracle: '0xb7c01385B368954573bEc08C1267FE816869D2a1',
    claimReceipt: '0x74c27cA51758407Fd7fAC612630553f3900B7B22',
    ...ZERO_MODULES,
  },
  // Base Sepolia STAGING — REAL institutional stack (Phase 11/12 broadcast,
  // 2026-06-10, deployments/84532-staging.json; deployer-operated roles).
  // Addresses come from the generated address book; key mapping:
  // mockUSDC <- usdc, nextBlockLens <- lens (other keys are 1:1).
  [NEXTBLOCK_CHAIN_ID]: {
    vaultFactory: NEXTBLOCK_ADDRESSES.vaultFactory,
    policyRegistry: NEXTBLOCK_ADDRESSES.policyRegistry,
    mockUSDC: NEXTBLOCK_ADDRESSES.usdc,
    mockOracle: NEXTBLOCK_ADDRESSES.mockOracle,
    claimReceipt: NEXTBLOCK_ADDRESSES.claimReceipt,
    protocolRoles: NEXTBLOCK_ADDRESSES.protocolRoles,
    complianceRegistry: NEXTBLOCK_ADDRESSES.complianceRegistry,
    portfolioRegistry: NEXTBLOCK_ADDRESSES.portfolioRegistry,
    premiumDistributor: NEXTBLOCK_ADDRESSES.premiumDistributor,
    navOracle: NEXTBLOCK_ADDRESSES.navOracle,
    vaultAllocator: NEXTBLOCK_ADDRESSES.vaultAllocator,
    claimManager: NEXTBLOCK_ADDRESSES.claimManager,
    aiAssessor: NEXTBLOCK_ADDRESSES.aiAssessor,
    bordereauOracle: NEXTBLOCK_ADDRESSES.bordereauOracle,
    adapterRegistry: NEXTBLOCK_ADDRESSES.adapterRegistry,
    nextBlockLens: NEXTBLOCK_ADDRESSES.lens,
    vaultDeployer: NEXTBLOCK_ADDRESSES.vaultDeployer,
  },
  // Ethereum Sepolia (LEGACY DEMO deploy - 2026-02-08)
  11155111: {
    vaultFactory: '0x0859faD8fA327417755D0E4E8a0c7d09FA5E9C52',
    policyRegistry: '0x5503d1f62fD9e80996f92FE28f1367d15CD7BCb8',
    mockUSDC: '0x3e658AAd7Ecb17b09cCda222C185A85eF946C28b',
    mockOracle: '0xa335e377684d8787D1928bC2e726D70911Cb4050',
    claimReceipt: '0x57848726D507CD6DcC94f7d92C2Ee30d6eB77Ef1',
    ...ZERO_MODULES,
  },
  // Arc Testnet (LEGACY DEMO deploy - 2026-02-07)
  5042002: {
    vaultFactory: '0x0B1dB106a79425e1AeFe4b144fC750793C4f8b49',
    policyRegistry: '0x2276a1076931De26FA4F1470ebC6b2820Fb087d3',
    mockUSDC: '0x12e49ee0f425C740f3dDdfdCD6496A73bCbC85e5',
    mockOracle: '0x9b7A5665Bea2DB15DF9Db0d32e8F07F9c949E5FC',
    claimReceipt: '0xb64734509467ab444674d8825e38711c5cBfe836',
    ...ZERO_MODULES,
  },
};

// Default export for backward compat
export const ADDRESSES = CHAIN_ADDRESSES[31337]!;
