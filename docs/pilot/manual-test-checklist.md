# Manual Test Checklist — NextBlock Pilot (Base Sepolia)

Manual QA pass for the pilot, focused on the Pilot Onboarding Hub (`/app/pilot`)
and the surrounding flows. Run with a wallet on Base Sepolia (84532). No real
funds. Record pass/fail and notes per case.

## How to use

For each case, set up the precondition, perform the action, and confirm the
expected result. The "Next action" column is what the Pilot Hub should recommend.

| # | Case | Precondition | Expected hub state / result | Next action shown |
|---|---|---|---|---|
| 1 | Wallet disconnected | no wallet connected | hub prompts to connect; no role/asset reads run | "Connect your wallet" |
| 2 | Wrong chain | wallet on a non-84532 network | switch-network prompt; **no transaction sent** | "Switch to Base Sepolia (84532)" |
| 3 | No test ETH | connected, 84532, 0 ETH | ETH checklist item = todo; blocked | "Get Base Sepolia ETH from a faucet" (with link) |
| 4 | No test USDC | connected, 84532, has ETH, 0 USDC | USDC item = todo (non-blocking for non-cedant) | cedant: "Mint test USDC"; others: proceed |
| 5 | KYB absent | funded wallet, no KYB record | KYB item = todo | "Submit your KYB application" → `/app/apply` |
| 6 | KYB pending | KYB `submitted` / `under_review` | KYB item = pending | "KYB is under review" |
| 7 | KYB approved, no role | KYB `approved`, no on-chain role | KYB = ok, role = todo | "Operator must grant your on-chain role; share your wallet" |
| 8 | KYB approved, role granted | role present on ProtocolRoles | role = ok; track "Unlocked" | "Open your role dashboard" → track route |
| 9 | Faucet mock USDC | funded wallet, 84532 | "Mint test USDC" sends a tx; USDC balance rises (~10,000) | USDC item flips to ok |
| 10 | Vault access (investor) | wallet eligible (`canReceive` true) | vault deposit succeeds; `nbUSDC` received | proceed in vault page |
| 11 | Supabase / KYB unavailable | `SUPABASE_SERVICE_ROLE_KEY` unset (503) | KYB item = na; "backend offline" message; app does not crash | "Ask the operator to enable KYB" |
| 12 | Health endpoint | any | `GET /api/health` returns 200 | n/a |

## Cross-cutting checks

- No console errors on `/app/pilot` in any state above.
- Wrong-chain never triggers a wallet transaction.
- Testnet disclaimer banner visible on the hub.
- Role chips reflect real on-chain `hasRole` (cross-check with a block explorer
  or `cast call ProtocolRoles hasRole(role,wallet)`).
- Faucet button disabled when on the wrong chain.
- KYB status lookup returns status only (no PII fields).

## Operator-side checks

- KYB review queue loads for the operator wallet; status transitions persist.
- Role Handoff: direct grant enabled only for an `OWNER_ROLE` wallet;
  non-owners see Safe calldata only; restricted roles
  (`OWNER_ROLE`, `DEFAULT_ADMIN_ROLE`, `VAULT_FACTORY_ROLE`) not selectable.
- After a grant, `hasRole(role, wallet)` is true on-chain and the applicant's
  hub shows the role granted.

## Result log

| Date | Tester | Cases passed | Cases failed | Notes |
|---|---|---|---|---|
| | | | | |
