# NextBlock hybrid email-wallet RBAC verification
Date: 2026-06-15

## TypeScript
PASS: ./node_modules/.bin/tsc --noEmit

## Targeted ESLint
PASS: targeted eslint modified files

## Next build
PASS: ./node_modules/.bin/next build

## Read-only on-chain role verification
chainId: 84532
blockNumber: 42877276
deployerOwner: 0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2 balanceEth=0.194755873179288659 OWNER=True KYC=True
pendingAdminOperator: 0x6495280c365b372230A275C8Fec6724e3FC228dB balanceEth=0 OWNER=False KYC=False
newAdminOperator: 0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e balanceEth=0.113352230325590139 OWNER=False KYC=False
pendingAdminOperator missingRoles=OWNER_ROLE,KYC_OPERATOR_ROLE
newAdminOperator missingRoles=OWNER_ROLE,KYC_OPERATOR_ROLE
