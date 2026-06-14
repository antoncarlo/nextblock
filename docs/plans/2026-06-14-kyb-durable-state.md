# KYB Durable State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rendere durevoli su Supabase i nonce single-use KYB e i rate-limit delle route KYB, mantenendo fallback locale solo per sviluppo/test senza configurazione Supabase e comportamento fail-closed quando lo store durevole configurato non è disponibile.

**Architecture:** Il branch parte da `origin/main` e conserva il contratto già introdotto per i nonce nei messaggi `operatorAuthMessage(action, timestamp, nonce)`. La modifica aggiunge una migration Supabase versionata ma non applicata in remoto, espone funzioni TypeScript asincrone con store Supabase iniettabile e aggiorna le route KYB per usare lo store durevole quando il client server-side esiste. Il codice non invia transazioni on-chain, non modifica Vercel e non applica migration remote.

**Tech Stack:** Next.js 16, TypeScript, Supabase JS service-role server-side, PostgreSQL/Supabase SQL migrations, Node 22 `--experimental-strip-types` smoke scripts.

---

### Task 1: Test RED per stato durevole KYB

**Files:**

- Create: `app/scripts/kyb-durable-state-smoke.ts`
- Modify later: `app/scripts/kyb-smoke.ts`

**Step 1: Write the failing test.**

Creare uno smoke script senza nuove dipendenze che importi le future API `createSupabaseNonceStore`, `issueNonce`, `consumeNonce`, `createSupabaseRateLimitStore` e `rateLimit`. Lo script deve verificare che lo store nonce Supabase inserisca una riga in `kyb_operator_nonces`, che il consume sia single-use in base al risultato di `.maybeSingle()`, che il rate-limit usi la RPC `kyb_consume_rate_limit`, e che il fallback in memoria consumi un nonce una sola volta.

**Step 2: Run test to verify it fails.**

Run: `cd app && node --experimental-strip-types scripts/kyb-durable-state-smoke.ts`

Expected: FAIL perché le API Supabase-backed non esistono ancora o perché le firme sono ancora sincrone/in-memory.

Actual RED: lo script è stato creato prima dell’implementazione e il contratto è fallito finché `createSupabaseNonceStore`, `createSupabaseRateLimitStore` e le firme asincrone non sono state introdotte. Actual GREEN: dopo migration locale e implementazione TypeScript, `cd app && node --experimental-strip-types scripts/kyb-durable-state-smoke.ts` passa tutti i check su inserimento nonce, consumo single-use, filtri `consumed_at/expires_at`, RPC rate-limit e fallback locale.

### Task 2: Migration locale Supabase 0002

**Files:**

- Create: `supabase/migrations/20260614214000_0002_kyb_durable_state.sql`

**Step 1: Create nonce table.**

Aggiungere `public.kyb_operator_nonces` con `operator_address`, `nonce`, `expires_at`, `consumed_at`, `created_at`, vincoli di formato, chiave primaria `(operator_address, nonce)`, indice su `expires_at` e RLS deny-by-default.

**Step 2: Create rate-limit table and RPC.**

Aggiungere `public.kyb_rate_limit_windows` con chiave primaria `(bucket, subject)`, finestre fixed-window e funzione `public.kyb_consume_rate_limit(p_bucket, p_subject, p_limit, p_window_seconds)` che usa lock riga/transazione, resetta finestre scadute, incrementa atomicamente quelle valide e restituisce `allowed`, `retry_after_seconds`, `current_count`, `reset_at`.

**Step 3: Permissions.**

Revocare accesso diretto e `EXECUTE` da `anon` e `authenticated`; concedere l’esecuzione della RPC solo a `service_role`. Lasciare RLS abilitata senza policy per ruoli client.

### Task 3: Implementazione TypeScript asincrona con store iniettabile

**Files:**

- Modify: `app/src/lib/kyb/nonces.ts`
- Modify: `app/src/lib/rate-limit.ts`

**Step 1: Nonce store.**

Convertire `issueNonce` e `consumeNonce` in funzioni asincrone. Aggiungere `createSupabaseNonceStore(supabase)` che inserisce nonce e li consuma con update atomico `consumed_at is null` e `expires_at > now`. Conservare fallback in memoria quando nessuno store è passato, per smoke/local development.

**Step 2: Rate-limit store.**

Convertire `rateLimit` in funzione asincrona con `createSupabaseRateLimitStore(supabase)`. Lo store durevole deve chiamare la RPC `kyb_consume_rate_limit`; il fallback in memoria resta disponibile quando nessuno store è passato.

### Task 4: Wiring route KYB

**Files:**

- Modify: `app/src/app/api/kyb/auth/nonce/route.ts`
- Modify: `app/src/app/api/kyb/applications/route.ts`
- Modify: `app/src/app/api/kyb/applications/[id]/review/route.ts`

**Step 1: Nonce endpoint.**

Ottenere il client Supabase server-side, applicare il rate-limit asincrono con store durevole quando disponibile, emettere il nonce tramite store Supabase quando disponibile, e ritornare `503` su errore store configurato.

**Step 2: Submit and review rate-limit.**

Aggiornare `POST /api/kyb/applications` e `POST /api/kyb/applications/[id]/review` per usare `await rateLimit(...)`. Se il client Supabase manca, mantenere `503 unavailable` come già previsto dalle route che scrivono o leggono KYB.

**Step 3: Review nonce consume.**

Dopo la verifica firma/ruolo, consumare il nonce con `await consumeNonce(..., createSupabaseNonceStore(supabase))`; su replay, nonce sconosciuto o store indisponibile, rispondere fail-closed.

### Task 5: Smoke, lint, build e documentazione operativa

**Files:**

- Modify: `app/scripts/kyb-smoke.ts`
- Modify: `NEXTBLOCK_GAP_MATRIX.md` if present and appropriate
- Modify/Create: `todo.md`

**Step 1: Extend smoke checks.**

Aggiornare lo smoke esistente per verificare il binding del nonce in `operatorAuthMessage` e la schema validation della richiesta review.

**Step 2: Run verification.**

Run: `cd app && node --experimental-strip-types scripts/kyb-smoke.ts`

Run: `cd app && node --experimental-strip-types scripts/kyb-durable-state-smoke.ts`

Run: `cd app && pnpm lint`

Run: `cd app && pnpm build`

**Step 3: Document status.**

Aggiornare i documenti locali per indicare che la migration è versionata nel branch ma non applicata al Supabase remoto. Non fare merge, non applicare migration e non deployare senza conferma esplicita.

Actual status: la migration `20260614214000_0002_kyb_durable_state.sql` è solo nel branch `feat/kyb-durable-state`; nessun comando di applicazione remota Supabase è stato eseguito. Gli endpoint KYB usano lo store Supabase quando il service-role client è presente e restano fail-closed su errori storage configurati.

Verification status: `node --experimental-strip-types scripts/kyb-smoke.ts`, `node --experimental-strip-types scripts/kyb-durable-state-smoke.ts` e `npm run build` passano. `npm run lint` resta bloccato da 3 errori `react-hooks/set-state-in-effect` già presenti fuori scope in `app/src/app/app/pilot/page.tsx`, `app/src/components/landing/ui/carousel.tsx` e `app/src/hooks-landing/use-mobile.tsx`; dopo la rimozione degli `any` dagli adapter, il log lint non cita file KYB modificati dal branch.

### Task 6: Commit e preparazione PR senza merge/deploy

**Files:**

- All touched files from previous tasks.

**Step 1: Inspect diff.**

Run: `git status --short && git diff --stat && git diff --check`.

**Step 2: Commit branch.**

Stage only relevant tracked/new files, escludendo i memo non tracciati preesistenti. Commit message: `feat(kyb): persist nonce and rate-limit state`.

**Step 3: Push and prepare PR summary.**

Push branch and, if all verification is fresh and successful, prepare PR text. Do not merge. Do not deploy.
