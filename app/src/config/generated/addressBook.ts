// Generated file. Do not edit manually.
// Source of truth: contracts/deployments/84532-staging.json
// Regenerate with: npm run codegen:addressbook (repository root)
// Drift is rejected in CI by: npm run check:addressbook
// Addresses are emitted verbatim from the deployment record, preserving the
// EIP-55 checksum casing written by the deployment broadcast.

export const NEXTBLOCK_CHAIN_ID = 84532 as const;

export const NEXTBLOCK_NETWORK_NAME = "base-sepolia" as const;

export const NEXTBLOCK_SCHEMA_VERSION = 1 as const;

export const NEXTBLOCK_DEPLOYMENT_TIMESTAMP = 1790937110 as const;

export const NEXTBLOCK_ADDRESSES = {
  adapterRegistry: "0x9D2F14f59f22A123D88845f9D1EacC1073429C06",
  aiAssessor: "0xF0ae92eEeb2AdDb6f2B4e8cf8000A8FF3614d904",
  bordereauOracle: "0xF679dd0387B3Cc25eB51fa12a5af1F73587A80F6",
  claimManager: "0x80467965d032Cd1d468fE174B3EE0cE351e90711",
  claimReceipt: "0xCB12016DF477a55b59078B095a5E1ED3aDB2D8F4",
  complianceRegistry: "0xFC8451b361239353a8c5631E4298164053be3E00",
  lens: "0x32ed5AE76c98b0553E4d975CebA99765f60A54a0",
  mockOracle: "0x6D65110bc8de553d5B59e6C2B0a5fDC1D91F5677",
  navOracle: "0xA46d3628D95a182E27C8Bc13822dF57D6E7e2916",
  policyRegistry: "0x01F73dc15bC016AFB0653530bd82a3377AB709e2",
  portfolioRegistry: "0xE641E9fdf299Bd903Fe8c39252D3A9625915dd12",
  premiumDistributor: "0xAc538FdAD984C95353D470669fB7D4CC2b055AcC",
  protocolRoles: "0xB073F2Da83F008be6C3Abce25eDe2aebD621c1ba",
  protocolTimelock: "0xD94ea36FD19a0D3Cb3A8EA1214C6F97A947e5950",
  safe: "0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15",
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  vault: "0xc197A6Ac093542Df6d378ce827B8aEE372f23Ffa",
  vaultAllocator: "0x2Ee3E2CDc0397b4b22b414F19f8023568Ba4423c",
  vaultDeployer: "0xE3Ae2cb2Ece154F47A3a3dE67773d6E29aC2a38C",
  vaultFactory: "0x70934a059dF0E9313CC34e81c3EC769cA295f97E",
} as const;

export const NEXTBLOCK_ROLES = {
  allocatorBot: "0xe10E5ed4f28405f3D65691BF0D35Da3dC81A23D8",
  cedant: "0xbF0b13e1319857f0f537bF024125B5e525fFce4D",
  committee: "0x4dA5dAa1D1702074aF919A5937d0e00E0DCaF555",
  curator: "0xBDEE4a8B7E23243de2113cfAA5ae6F5622fB5907",
  deployer: "0x090043bF030C12d8761441790EB2CF81F0eDcf2c",
  kycOperator: "0xe6b36f7Fcfb497714006B22e938F150CbeC97cf0",
  oracleNode: "0x899b0840Da6da6356a05b2Da122A79F54CFbFecd",
  owner: "0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15",
  sentinel: "0xDD66a82A13b62684b23430eB250b61c2F9A9FDF5",
} as const;

export type NextBlockContractName = keyof typeof NEXTBLOCK_ADDRESSES;

export type NextBlockRoleName = keyof typeof NEXTBLOCK_ROLES;

export interface NextBlockAddressBook {
  readonly chainId: typeof NEXTBLOCK_CHAIN_ID;
  readonly networkName: typeof NEXTBLOCK_NETWORK_NAME;
  readonly schemaVersion: typeof NEXTBLOCK_SCHEMA_VERSION;
  readonly deploymentTimestamp: typeof NEXTBLOCK_DEPLOYMENT_TIMESTAMP;
  readonly addresses: typeof NEXTBLOCK_ADDRESSES;
  readonly roles: typeof NEXTBLOCK_ROLES;
}

export const NEXTBLOCK_ADDRESS_BOOK: NextBlockAddressBook = {
  chainId: NEXTBLOCK_CHAIN_ID,
  networkName: NEXTBLOCK_NETWORK_NAME,
  schemaVersion: NEXTBLOCK_SCHEMA_VERSION,
  deploymentTimestamp: NEXTBLOCK_DEPLOYMENT_TIMESTAMP,
  addresses: NEXTBLOCK_ADDRESSES,
  roles: NEXTBLOCK_ROLES,
};
