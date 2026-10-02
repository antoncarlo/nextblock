#!/usr/bin/env bash
# Rehearses the whole Base Sepolia redeploy on a local fork of the chain.
#
# It runs the sequence in contracts/REDEPLOY_RUNBOOK.md end to end -- deploy with
# eight distinct role holders, governance phase 1, a timelocked operation, phase 2
# -- and asserts the on-chain end state after each step. Nothing here is a secret:
# the keys are the well-known anvil test keys, the chain is a throwaway local fork,
# and no transaction ever reaches the real network.
#
# Run it before the real deploy, and again after any change to the deploy or
# governance scripts. Needs forge, cast and anvil (1.8.3 is what CI pins) and
# network access to a Base Sepolia RPC for the fork.
#
#   bash scripts/rehearse-redeploy.sh
#
# Environment (all optional):
#   BASE_SEPOLIA_RPC_URL  upstream RPC to fork        (default https://sepolia.base.org)
#   REHEARSAL_PORT        local anvil port            (default 8546)
#   FORGE / CAST / ANVIL  paths to the binaries       (default: from PATH)
set -euo pipefail

FORGE="${FORGE:-forge}"; CAST="${CAST:-cast}"; ANVIL="${ANVIL:-anvil}"
UPSTREAM="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
PORT="${REHEARSAL_PORT:-8546}"
RPC="http://127.0.0.1:${PORT}"

cd "$(dirname "$0")/../contracts"
TMP="$(mktemp -d)"
JSON="deployments/84532-staging.json"

# anvil public test accounts 0-8. The deployer is account 0; every operator role
# gets its own account so the rehearsal exercises a separated deployment.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
OWNER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
CURATOR=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
ALLOCATOR=0x90F79bf6EB2c4f870365E785982E1f101E93b906
SENTINEL=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
COMMITTEE=0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
KYC=0x976EA74026E726554dB657fA54763abd0C3a0aa9
ORACLE=0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
CEDANT=0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f
SAFE=0x0969B20f1d8a5628613f00fa6aDBE85e715fEf15   # the real protocol Safe (1.5.0, threshold 1); a contract on the fork
CIRCLE_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Circle USDC on Base Sepolia: the settlement asset
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000

CHECKS=0
ok()   { CHECKS=$((CHECKS + 1)); echo "  ok    $1"; }
die()  { echo "  FAIL  $1" >&2; exit 1; }
eq()   { [ "$2" = "$3" ] && ok "$1" || die "$1 (got '$2', want '$3')"; }
step() { echo; echo "== $1"; }
has()  { "$CAST" call "$ROLES" "hasRole(bytes32,address)(bool)" "$1" "$2" --rpc-url "$RPC"; }
role() { "$CAST" call "$ROLES" "$1()(bytes32)" --rpc-url "$RPC"; }
jget() { node -e "const v=JSON.parse(require('fs').readFileSync('$JSON','utf8'))['$1'];console.log(v===undefined?'':v)"; }

# The deploy scripts write the deployment record in place. Put it back byte for
# byte afterwards so a rehearsal never leaves a mark on the working tree, and send
# broadcast artifacts to a scratch directory instead of contracts/broadcast.
HAD_JSON=0
if [ -f "$JSON" ]; then cp "$JSON" "$TMP/staging.json.bak"; HAD_JSON=1; fi
export FOUNDRY_BROADCAST="$TMP/broadcast"
ANVIL_PID=""
cleanup() {
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  if [ "$HAD_JSON" = 1 ]; then cp "$TMP/staging.json.bak" "$JSON"; else rm -f "$JSON"; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

step "0. fork Base Sepolia locally ($("$FORGE" --version | head -1))"
"$ANVIL" --fork-url "$UPSTREAM" --port "$PORT" --silent > "$TMP/anvil.log" 2>&1 &
ANVIL_PID=$!
CID=""
for _ in $(seq 1 60); do
  CID="$("$CAST" chain-id --rpc-url "$RPC" 2>/dev/null || true)"
  if [ -n "$CID" ]; then break; fi
  sleep 1
done
eq "forked chain id is Base Sepolia" "${CID:-none}" "84532"

step "1. an unconfigured deploy is refused"
set +e
OUT="$(env -u OWNER_ADDRESS -u CURATOR_ADDRESS -u ALLOCATOR_ADDRESS -u SENTINEL_ADDRESS -u COMMITTEE_ADDRESS \
        -u KYC_OPERATOR_ADDRESS -u ORACLE_ADDRESS -u CEDANT_ADDRESS -u ALLOW_SINGLE_KEY -u USDC_ADDRESS -u ALLOW_MOCK_USDC \
        PRIVATE_KEY="$DEPLOYER_KEY" "$FORGE" script script/DeployRedemptionQueue.s.sol --rpc-url "$RPC" 2>&1)"
RC=$?
set -e
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "RoleNotSeparated"; then
  ok "no role variables set -> refused (RoleNotSeparated)"
else
  die "an unconfigured deploy was not refused (exit $RC)"
fi

step "1b. roles set but no real settlement asset: refused (no silent MockUSDC)"
ROLE_ENV=(OWNER_ADDRESS="$OWNER" CURATOR_ADDRESS="$CURATOR" ALLOCATOR_ADDRESS="$ALLOCATOR" SENTINEL_ADDRESS="$SENTINEL"
          COMMITTEE_ADDRESS="$COMMITTEE" KYC_OPERATOR_ADDRESS="$KYC" ORACLE_ADDRESS="$ORACLE" CEDANT_ADDRESS="$CEDANT")
set +e
OUT="$(env -u USDC_ADDRESS -u ALLOW_MOCK_USDC "${ROLE_ENV[@]}" PRIVATE_KEY="$DEPLOYER_KEY" \
        "$FORGE" script script/DeployRedemptionQueue.s.sol --rpc-url "$RPC" 2>&1)"
RC=$?
set -e
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "MockAssetOnSharedChain"; then
  ok "no USDC_ADDRESS -> refused (MockAssetOnSharedChain)"
else
  die "a deploy without a settlement asset was not refused (exit $RC)"
fi
set +e
OUT="$(env "${ROLE_ENV[@]}" USDC_ADDRESS=0x000000000000000000000000000000000000dEaD PRIVATE_KEY="$DEPLOYER_KEY" \
        "$FORGE" script script/DeployRedemptionQueue.s.sol --rpc-url "$RPC" 2>&1)"
RC=$?
set -e
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "AssetNotDeployed"; then
  ok "an address with no code as USDC_ADDRESS -> refused (AssetNotDeployed)"
else
  die "an asset with no code was not refused (exit $RC)"
fi

step "2. deploy the generation with eight distinct role holders"
export PRIVATE_KEY="$DEPLOYER_KEY" OWNER_ADDRESS="$OWNER" CURATOR_ADDRESS="$CURATOR" ALLOCATOR_ADDRESS="$ALLOCATOR" \
       SENTINEL_ADDRESS="$SENTINEL" COMMITTEE_ADDRESS="$COMMITTEE" KYC_OPERATOR_ADDRESS="$KYC" \
       ORACLE_ADDRESS="$ORACLE" CEDANT_ADDRESS="$CEDANT" USDC_ADDRESS="$CIRCLE_USDC"
if ! "$FORGE" script script/DeployRedemptionQueue.s.sol --rpc-url "$RPC" --broadcast > "$TMP/deploy.log" 2>&1; then
  tail -25 "$TMP/deploy.log"; die "deploy script failed"
fi
ROLES="$(jget protocolRoles)"; VAULT="$(jget vault)"; FACTORY="$(jget vaultFactory)"; POLICY="$(jget policyRegistry)"
COMPLIANCE="$(jget complianceRegistry)"
QUEUE="$(grep -m1 'queue:' "$TMP/deploy.log" | awk '{print $NF}')"
ok "deployed: roles $ROLES, vault $VAULT, queue $QUEUE"

step "3. every role sits where the configuration put it"
eq "owner holds OWNER_ROLE"                  "$(has "$(role OWNER_ROLE)" $OWNER)" true
eq "curator holds UNDERWRITING_CURATOR_ROLE" "$(has "$(role UNDERWRITING_CURATOR_ROLE)" $CURATOR)" true
eq "allocator holds ALLOCATOR_ROLE"          "$(has "$(role ALLOCATOR_ROLE)" $ALLOCATOR)" true
eq "sentinel holds SENTINEL_ROLE"            "$(has "$(role SENTINEL_ROLE)" $SENTINEL)" true
eq "committee holds CLAIMS_COMMITTEE_ROLE"   "$(has "$(role CLAIMS_COMMITTEE_ROLE)" $COMMITTEE)" true
eq "kyc operator holds KYC_OPERATOR_ROLE"    "$(has "$(role KYC_OPERATOR_ROLE)" $KYC)" true
eq "oracle holds ORACLE_ROLE"                "$(has "$(role ORACLE_ROLE)" $ORACLE)" true
eq "cedant holds AUTHORIZED_CEDANT_ROLE"     "$(has "$(role AUTHORIZED_CEDANT_ROLE)" $CEDANT)" true
for R in UNDERWRITING_CURATOR_ROLE ALLOCATOR_ROLE SENTINEL_ROLE CLAIMS_COMMITTEE_ROLE KYC_OPERATOR_ROLE ORACLE_ROLE AUTHORIZED_CEDANT_ROLE; do
  eq "deployer holds no $R" "$(has "$(role $R)" $DEPLOYER)" false
done
eq "the vault factory holds VAULT_FACTORY_ROLE" "$(has "$(role VAULT_FACTORY_ROLE)" "$FACTORY")" true

step "3b. the settlement asset is Circle's USDC"
lcase() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
eq "the deployment record names Circle's USDC" "$(lcase "$(jget usdc)")" "$(lcase "$CIRCLE_USDC")"
eq "the vault settles in Circle's USDC" "$(lcase "$("$CAST" call "$VAULT" "asset()(address)" --rpc-url "$RPC")")" "$(lcase "$CIRCLE_USDC")"
eq "the asset reports USDC with 6 decimals" \
   "$("$CAST" call "$CIRCLE_USDC" "symbol()(string)" --rpc-url "$RPC" | tr -d '"') $("$CAST" call "$CIRCLE_USDC" "decimals()(uint8)" --rpc-url "$RPC")" "USDC 6"

step "4. properties of this generation"
eq "the clock is still movable (lock it deliberately, later)" \
   "$("$CAST" call "$POLICY" "clockLocked()(bool)" --rpc-url "$RPC")" false
CM="$("$CAST" call "$VAULT" "claimManager()(address)" --rpc-url "$RPC")"
if [ "$CM" != "0x0000000000000000000000000000000000000000" ]; then ok "the vault has a claim manager bound ($CM)"; else die "the vault has no claim manager"; fi
eq "the redemption queue is an approved venue" \
   "$("$CAST" call "$COMPLIANCE" "approvedVenue(address)(bool)" "$QUEUE" --rpc-url "$RPC")" true

step "4b. the lending layer, added to the generation that is already deployed"
export FEE_RECIPIENT="$SAFE"
if ! "$FORGE" script script/DeployLendingLayer.s.sol --rpc-url "$RPC" --broadcast > "$TMP/lending.log" 2>&1; then
  tail -25 "$TMP/lending.log"; die "lending layer deploy failed"
fi
LMARKET="$(jget lendingMarket)"
if [ -n "$LMARKET" ]; then ok "recorded lendingMarket $LMARKET in the deployment record"; else die "lendingMarket was not recorded"; fi
lc() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
eq "the market's collateral is the generation's vault" "$(lc "$("$CAST" call "$LMARKET" "collateralToken()(address)" --rpc-url "$RPC")")" "$(lc "$VAULT")"
eq "protocol fees go to the governance Safe"           "$(lc "$("$CAST" call "$LMARKET" "feeRecipient()(address)" --rpc-url "$RPC")")" "$(lc "$SAFE")"
eq "the market is an approved venue" "$("$CAST" call "$COMPLIANCE" "approvedVenue(address)(bool)" "$LMARKET" --rpc-url "$RPC")" true
eq "the deployer gave back UNDERWRITING_CURATOR_ROLE" "$(has "$(role UNDERWRITING_CURATOR_ROLE)" $DEPLOYER)" false
eq "the deployer gave back KYC_OPERATOR_ROLE"         "$(has "$(role KYC_OPERATOR_ROLE)" $DEPLOYER)" false

step "5. governance phase 1 (timelock + Safe)"
export PROTOCOL_ROLES="$ROLES" SAFE_ADDRESS="$SAFE" EXECUTOR_ADDRESS="$OWNER" MIN_DELAY=86400 RENOUNCE_DEPLOYER=false
if ! "$FORGE" script script/GovernanceMigration.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast > "$TMP/gov1.log" 2>&1; then
  tail -25 "$TMP/gov1.log"; die "governance phase 1 failed"
fi
TL="$(jget protocolTimelock)"
if [ -n "$TL" ]; then ok "phase 1 recorded protocolTimelock $TL in the deployment record"; else die "protocolTimelock was not recorded"; fi
eq "phase 1 recorded the Safe" "$(jget safe)" "$SAFE"
eq "timelock holds OWNER_ROLE"         "$(has "$(role OWNER_ROLE)" "$TL")" true
eq "timelock holds DEFAULT_ADMIN_ROLE" "$(has $ZERO32 "$TL")" true
eq "deployer still holds OWNER_ROLE (phase 2 is pending)" "$(has "$(role OWNER_ROLE)" $DEPLOYER)" true
if "$FORGE" script script/GovernanceCheck.s.sol --rpc-url "$RPC" > "$TMP/govcheck.log" 2>&1; then
  ok "GovernanceCheck reads the record and reports"
else
  tail -10 "$TMP/govcheck.log"; die "GovernanceCheck failed"
fi

step "6. rehearse one timelocked operation as the Safe"
DATA="$("$CAST" calldata "grantRole(bytes32,address)" "$(role ORACLE_ROLE)" $ORACLE)"
SALT=0x0000000000000000000000000000000000000000000000000000000000000001
OPID="$("$CAST" call "$TL" "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)" "$ROLES" 0 "$DATA" $ZERO32 $SALT --rpc-url "$RPC")"
"$CAST" rpc anvil_impersonateAccount "$SAFE" --rpc-url "$RPC" > /dev/null
"$CAST" rpc anvil_setBalance "$SAFE" 0xde0b6b3a7640000 --rpc-url "$RPC" > /dev/null
"$CAST" send "$TL" "schedule(address,uint256,bytes,bytes32,bytes32,uint256)" "$ROLES" 0 "$DATA" $ZERO32 $SALT 86400 \
  --from "$SAFE" --unlocked --rpc-url "$RPC" > /dev/null
eq "the operation is pending after scheduling" "$("$CAST" call "$TL" "isOperationPending(bytes32)(bool)" "$OPID" --rpc-url "$RPC")" true
set +e
"$CAST" send "$TL" "execute(address,uint256,bytes,bytes32,bytes32)" "$ROLES" 0 "$DATA" $ZERO32 $SALT \
  --from "$OWNER" --unlocked --rpc-url "$RPC" > /dev/null 2>&1
EARLY=$?
set -e
if [ "$EARLY" -ne 0 ]; then ok "executing before the delay is refused"; else die "executed before the delay"; fi
"$CAST" rpc evm_increaseTime 86401 --rpc-url "$RPC" > /dev/null
"$CAST" rpc evm_mine --rpc-url "$RPC" > /dev/null
"$CAST" send "$TL" "execute(address,uint256,bytes,bytes32,bytes32)" "$ROLES" 0 "$DATA" $ZERO32 $SALT \
  --from "$OWNER" --unlocked --rpc-url "$RPC" > /dev/null
eq "the operation executes after the delay" "$("$CAST" call "$TL" "isOperationDone(bytes32)(bool)" "$OPID" --rpc-url "$RPC")" true

step "7. governance phase 2 (the deployer renounces)"
export RENOUNCE_DEPLOYER=true TIMELOCK_ADDRESS="$TL" RETIRING_KEY="$DEPLOYER"
set +e
OUT="$(REHEARSAL_OPERATION_ID=0x0000000000000000000000000000000000000000000000000000000000003039 \
       "$FORGE" script script/GovernanceMigration.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast 2>&1)"
RC=$?
set -e
if [ "$RC" -ne 0 ] && echo "$OUT" | grep -q "rehearsal not executed"; then
  ok "phase 2 refuses an operation that never ran"
else
  die "phase 2 accepted an unexecuted operation"
fi
if ! REHEARSAL_OPERATION_ID="$OPID" "$FORGE" script script/GovernanceMigration.s.sol --rpc-url "$RPC" \
     --private-key "$DEPLOYER_KEY" --broadcast > "$TMP/gov2.log" 2>&1; then
  tail -25 "$TMP/gov2.log"; die "phase 2 failed"
fi
eq "deployer no longer holds OWNER_ROLE"         "$(has "$(role OWNER_ROLE)" $DEPLOYER)" false
eq "deployer no longer holds DEFAULT_ADMIN_ROLE" "$(has $ZERO32 $DEPLOYER)" false
eq "the timelock is the role administrator"      "$(has "$(role OWNER_ROLE)" "$TL")" true

step "8. post-deploy sanity"
if "$FORGE" script script/SanityCheck.s.sol --rpc-url "$RPC" > "$TMP/sanity.log" 2>&1; then
  ok "SanityCheck passes against the new generation"
else
  tail -15 "$TMP/sanity.log"; die "SanityCheck failed"
fi

echo
echo "REHEARSAL PASSED -- $CHECKS checks. The working tree is untouched."
