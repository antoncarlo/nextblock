import { createPublicClient, http, parseAbi, getContract, keccak256, toBytes, formatEther } from 'viem';

const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const chain = {
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

const contracts = {
  protocolRoles: '0xEE93166a2cf213243eF330a664682290b195c976',
};

const wallets = {
  deployerOwner: '0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2',
  pendingAdminOperator: '0x6495280c365b372230A275C8Fec6724e3FC228dB',
  newAdminOperator: '0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e',
};

const rolesToCheck = [
  'OWNER_ROLE',
  'KYC_OPERATOR_ROLE',
  'SENTINEL_ROLE',
  'UNDERWRITING_CURATOR_ROLE',
  'ALLOCATOR_ROLE',
  'CLAIMS_COMMITTEE_ROLE',
  'PREMIUM_DEPOSITOR_ROLE',
  'AUTHORIZED_CEDANT_ROLE',
  'ORACLE_ROLE',
];

const recommendedGrants = {
  pendingAdminOperator: ['OWNER_ROLE', 'KYC_OPERATOR_ROLE'],
  newAdminOperator: ['OWNER_ROLE', 'KYC_OPERATOR_ROLE'],
};

const rolesAbi = parseAbi([
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
]);

const client = createPublicClient({ chain, transport: http(rpcUrl) });
const roles = getContract({ address: contracts.protocolRoles, abi: rolesAbi, client });

const roleHashes = Object.fromEntries(rolesToCheck.map((role) => [role, keccak256(toBytes(role))]));

async function inspectWallet(label, address) {
  const balanceWei = await client.getBalance({ address });
  const roleEntries = await Promise.all(
    rolesToCheck.map(async (role) => {
      const hasRole = await roles.read.hasRole([roleHashes[role], address]);
      return [role, hasRole];
    }),
  );

  return {
    label,
    address,
    balanceEth: formatEther(balanceWei),
    roles: Object.fromEntries(roleEntries),
  };
}

function buildCastCommand(role, address) {
  return [
    `cast send ${contracts.protocolRoles} \\`,
    '  "grantRole(bytes32,address)" \\',
    `  $(cast keccak "${role}") \\`,
    `  ${address} \\`,
    '  --rpc-url https://sepolia.base.org \\',
    '  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>',
  ].join('\n');
}

const [chainId, blockNumber] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
]);

const walletReports = await Promise.all(
  Object.entries(wallets).map(([label, address]) => inspectWallet(label, address)),
);

const grantPlan = Object.fromEntries(
  Object.entries(recommendedGrants).map(([walletLabel, roles]) => {
    const walletAddress = wallets[walletLabel];
    const currentReport = walletReports.find((report) => report.label === walletLabel);
    const missingRoles = roles.filter((role) => !currentReport?.roles?.[role]);
    return [
      walletLabel,
      {
        address: walletAddress,
        recommendedRoles: roles,
        missingRoles,
        alreadyPresentRoles: roles.filter((role) => currentReport?.roles?.[role]),
        commands: missingRoles.map((role) => ({ role, command: buildCastCommand(role, walletAddress) })),
      },
    ];
  }),
);

const deployerCanGrant = {
  address: wallets.deployerOwner,
  hasOwnerRole: walletReports.find((report) => report.label === 'deployerOwner')?.roles?.OWNER_ROLE === true,
  balanceEth: walletReports.find((report) => report.label === 'deployerOwner')?.balanceEth,
};

const result = {
  checkedAt: new Date().toISOString(),
  rpcUrl,
  chainId,
  blockNumber: blockNumber.toString(),
  contracts,
  roleHashes,
  wallets: walletReports,
  deployerCanGrant,
  grantPlan,
  safetyNotes: [
    'Script read-only: non firma transazioni e non legge private key.',
    'Eseguire i comandi grantRole solo nel terminale controllato dal proprietario/deployer.',
    'Finanziare con ETH Base Sepolia i wallet che dovranno firmare dal browser o da CLI.',
  ],
};

console.log(JSON.stringify(result, null, 2));
