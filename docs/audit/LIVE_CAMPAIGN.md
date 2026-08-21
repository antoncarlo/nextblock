# Live campaign — Anvil (L1/L2)

The off-chain harness driven against a full local deployment, with real
calldata and the shadow ledger checked after every action. This is the L2-style
run: no real keys, Anvil's published accounts, roles distributed to distinct
addresses first so the separation invariants have something to bind.

## Result — 500 actions, 11 agents

- **Harness findings: 0.** Every action the twelve policies produced was encoded
  against the real ABI and reached its contract. The encoder covers the roster
  with nothing missing and nothing dead.
- **P0 (funds moved wrongly, or ledger divergence): 0.** The shadow ledger,
  computed from the specification rather than from the contract, agreed with the
  chain throughout.
- **P1 (perimeter breached): 0.** Nothing the protocol was meant to refuse got
  through.
- **P2/P3 (legitimate action refused, or refused for the wrong reason): 319.**
  These are the adapter asking for something in a state that does not hold — a
  claim read as approved when it is pending, premium before setPortfolioVault —
  and the protocol correctly refusing. They are limits of this adapter, not
  defects in the protocol, and tightening the adapter is what removes them.

The raw log is in `live-campaign-anvil.log`.

## What still needs the owner (L3, Base Sepolia)

The staging run needs real signers and a faucet, which do not pass through the
assistant. One open question first: the twenty-four simulation identities are a
disjoint set from the seven governance addresses the owner controls, so before
L3 the roles must either be granted to the simulation roster or the simulation
must sign with the governance addresses. Nothing about L1 or L2 depends on it.
