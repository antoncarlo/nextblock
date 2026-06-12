# Contributing

## Setup

- Node 22 and npm 10+.
- Foundry (forge/cast) for contracts work; libs are pinned git submodules:
  `git submodule update --init --recursive` after cloning.
- Frontend installs are anchored to `app/`: always use the root scripts
  (`npm run ci:frontend:install`), never a bare `npm install` inside `app/`
  (the root workspace has no lockfile by design and bare npm commands resolve
  against it).
- Copy `app/.env.example` to `app/.env.local` for local configuration. Never
  commit `.env.local` or any real secret value.

## Branch and PR flow

- `main` is protected by convention: changes land via feature branches
  (`feat/...`, `chore/...`, `fix/...`) and pull requests with green CI
  (jobs: addressbook, frontend, contracts).
- Direct pushes to `main` are reserved for explicitly authorized maintainer
  operations.
- Commit style: conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`,
  `style:`), imperative subject, no emoji.

## Required checks before any PR

```bash
npm run check:addressbook
npm run ci:frontend:lint
npm run ci:frontend:typecheck
npm run ci:frontend:build
npm run ci:contracts:fmt
npm run ci:contracts:build
npm run ci:contracts:test
```

Contracts changes additionally require: tests for every new function
(success, revert, events), fuzz tests where values vary, invariant coverage
for cross-module accounting, and `forge fmt`. Update the gas snapshot with
`npm run audit:contracts:snapshot:update` when gas profiles legitimately
change, and say so in the PR.

## Hard rules

- No secrets in code, tests, fixtures or logs. No real keys even in examples.
- No PII in public API responses.
- Base-only: do not add non-Base chains as operational targets.
- Never weaken KYC/whitelist enforcement, claim dispute paths, UPR accounting
  or rounding direction (round down to users, up for liabilities).
- The deployment address book (`contracts/deployments/*.json`) is the single
  source of truth: frontend addresses are generated, never hand-edited
  (`npm run codegen:addressbook`).
- Update `NEXTBLOCK_GAP_MATRIX.md` when a change closes or opens a gap.
