// Generated file. Do not edit manually.
// Source of truth: contracts/deployments/84532-staging.json
// Regenerate with: npm run codegen:addressbook (repository root)
// Drift is rejected in CI by: npm run check:addressbook
// Addresses are emitted verbatim from the deployment record, preserving the
// EIP-55 checksum casing written by the deployment broadcast.

export const NEXTBLOCK_CHAIN_ID = 84532 as const;

export const NEXTBLOCK_NETWORK_NAME = "base-sepolia" as const;

export const NEXTBLOCK_SCHEMA_VERSION = 1 as const;

export const NEXTBLOCK_DEPLOYMENT_TIMESTAMP = 1790869816 as const;

export const NEXTBLOCK_ADDRESSES = {
  adapterRegistry: "0x50F1FCC97286C0364be73caD7bfd829728971a50",
  aiAssessor: "0xd8D8aeDE5Bc72f6e76d18d7Ad3ADD76B9DB513A8",
  bordereauOracle: "0x92592DCC0fa3c2B6E15B4450ef4b431E590d6b62",
  claimManager: "0xF8cA31650619bf94f19E469038482FE1563f878C",
  claimReceipt: "0x37a76bC9002D0d011b200333f11e2F1F07d4A9B7",
  complianceRegistry: "0x23BD832fe3f445A34409Ee227494099862D69138",
  lens: "0x21218E763AC9C821439e819CF82eFe2ecf4E6e3c",
  mockOracle: "0x9A22a0084b0234900A398FB7032229bE470B3495",
  navOracle: "0x37d72B97B44e5aBDEEdf7De690a421A6B67e691A",
  policyRegistry: "0xD138A09D47919dda626735Af28992eD10F07FB11",
  portfolioRegistry: "0xEe2cAce41b0ce40d6a102e1Fa9061F457d3dcBbe",
  premiumDistributor: "0xC215C48f3E3ee86BBc89F1293865146388C917C1",
  protocolRoles: "0x341cBf2f99674b96455dDE3e23Ff1cE2C59b2a36",
  protocolTimelock: "0xc2d419c6EEaC865fE81DAFa7C848fD7d5a5674a7",
  safe: "0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15",
  usdc: "0x86C0fe074E27e67a1bd0B1DE5610ba68CBAeE51b",
  vault: "0x73072c9ad6599B14afB358841B345f333F5acf53",
  vaultAllocator: "0xDDFeace2E2Ca7F74B565C7C8746BF9f6F588b5dD",
  vaultDeployer: "0xE0065Db4F40982b2267b0f23C72D0EC272B8E0A4",
  vaultFactory: "0x6831323b0CF45B9873d3558C89D259dc2846DB8a",
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
