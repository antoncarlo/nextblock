# Hybrid Email-Wallet RBAC Implementation Plan


**Goal:** Consentire a un operatore NextBlock di accedere via email e operare nel pannello admin con privilegi applicativi equivalenti a quelli del wallet autorizzato, senza eliminare la fonte di verità on-chain per le transazioni che richiedono firma.

**Architecture:** L’app deve separare due livelli oggi fusi insieme: **identità applicativa** e **autorità on-chain**. L’identità applicativa sarà una sessione Supabase Auth email-based con RBAC off-chain in tabelle dedicate; l’autorità on-chain resterà necessaria per azioni che modificano contratti, come `grantRole` o `setWhitelist`, salvo introduzione futura di un relayer/server wallet esplicitamente approvato. Le API KYB accetteranno sia autenticazione wallet firmata sia sessione email autorizzata, mantenendo audit trail e fail-closed behavior.

**Tech Stack:** Next.js App Router, React 19, Supabase Auth, Supabase Postgres, `@supabase/supabase-js`, `viem`, `wagmi`, Base Sepolia, ProtocolRoles, ComplianceRegistry.

---

## Decisione architetturale

L’accesso via email deve risolvere il problema operativo quotidiano: l’utente admin non deve essere costretto a collegare e firmare con wallet per leggere code KYB, approvare pratiche, visualizzare pannelli e generare istruzioni operative. Tuttavia, l’accesso email **non può magicamente sostituire una firma EVM** quando una transazione deve essere inviata a Base Sepolia, perché `grantRole` e `setWhitelist` sono funzioni di smart contract e richiedono un firmatario on-chain con ruolo adeguato e gas.

La soluzione corretta è quindi un modello ibrido. La sessione email concede privilegi **applicativi**; il wallet concede privilegi **crittografici/on-chain**. Per evitare di “non arrivare mai a una fine”, l’app deve permettere all’admin email di completare tutto il flusso off-chain e produrre in modo assistito la transazione finale. Se si vuole anche eseguire automaticamente la transazione finale senza wallet, serve una fase successiva: un relayer controllato, limitato e auditato, finanziato su testnet e autorizzato on-chain.

| Livello | Identità | Dove vive il permesso | Cosa abilita | Limite |
|---|---|---|---|---|
| Applicativo | Email Supabase Auth | Tabelle `app_users`, `app_user_roles`, opzionalmente `app_user_wallets` | Accesso `/app/admin`, lista KYB, review KYB, dashboard, generazione calldata | Non firma transazioni EVM |
| Wallet | Indirizzo EVM | `ProtocolRoles` e `ComplianceRegistry` on-chain | `grantRole`, `setWhitelist`, transazioni Base Sepolia | Richiede wallet/chiave/gas |
| Ibrido | Email + wallet collegato | DB + chain | UI completa, audit, possibilità di mostrare stato on-chain del wallet collegato | Serve firma per write on-chain |
| Relayer futuro | Account server o Safe module | Chain + policy server | Esecuzione assistita di alcune tx testnet | Richiede gestione chiavi e policy di sicurezza |

## Matrice ruoli proposta

Il progetto oggi mappa l’admin panel principalmente sui ruoli `OWNER_ROLE`, `SENTINEL_ROLE` e `KYC_OPERATOR_ROLE` letti da `ProtocolRoles`. Il nuovo RBAC applicativo deve usare nomi espliciti e non ambigui, collegati alle capacità effettive dell’interfaccia.

| Ruolo applicativo | Capacità UI/API | Equivalente on-chain desiderato | Note di sicurezza |
|---|---|---|---|
| `admin` | Accesso pieno `/app/admin`, gestione pratiche, gestione operatori applicativi, visualizzazione role handoff | `OWNER_ROLE` o `SENTINEL_ROLE` | Può amministrare RBAC off-chain; non deve poter rubare transazioni on-chain |
| `kyb_operator` | Lettura e review KYB, approvazione/rejection/needs_info, generazione calldata whitelist | `KYC_OPERATOR_ROLE` o `OWNER_ROLE` | Può istruire whitelist ma non eseguirla senza wallet/relayer |
| `role_manager` | Generazione istruzioni `grantRole`, verifica ruoli, handoff operativi | `OWNER_ROLE` | Solo admin senior |
| `viewer` | Lettura code e dashboard, nessuna mutazione | Nessuno richiesto | Utile per revisione interna |

## Wallet da includere nella gestione ruoli

Sono coinvolti almeno tre indirizzi operativi nel contesto corrente. Le verifiche e gli script non devono stampare private key e non devono firmare senza autorizzazione esplicita.

| Wallet | Funzione attesa | Stato noto da verificare on-chain | Azione consigliata |
|---|---|---|---|
| `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` | Deployer / owner operativo testnet | Già verificato come `OWNER_ROLE=true` e `KYC_OPERATOR_ROLE=true` in sessione precedente | Può eseguire `grantRole` e finanziare altri wallet testnet |
| `0x6495280c365b372230A275C8Fec6724e3FC228dB` | Admin/operator wallet aggiuntivo | Da ultimo controllo risultava senza ruoli e senza gas | Eseguire `grantRole` e finanziare con ETH Base Sepolia |
| `0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e` | Nuovo wallet da aggiungere ad admin e altri ruoli | Da verificare | Preparare `grantRole` per i ruoli necessari e funding gas se dovrà firmare |

## Task 1: Creare schema Supabase per RBAC applicativo

**Files:**

- Create: `app/supabase/migrations/20260615_app_rbac.sql`
- Modify: `app/src/integrations/supabase/types.ts` dopo applicazione migrazione e rigenerazione tipi

**Step 1: Scrivere migrazione SQL**

Creare tabelle minime e auditabili:

```sql
create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_roles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('admin', 'kyb_operator', 'role_manager', 'viewer')),
  granted_by uuid references public.app_users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.app_user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  wallet_address text not null,
  label text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_address),
  check (wallet_address ~ '^0x[0-9a-fA-F]{40}$')
);

create table if not exists public.app_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id),
  actor_wallet text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

**Step 2: Aggiungere RLS fail-closed**

Abilitare RLS su tutte le nuove tabelle. Le letture e le scritture operative devono essere effettuate dalle API server-side con `SUPABASE_SERVICE_ROLE_KEY`; lato client si deve leggere solo la propria sessione o chiamare endpoint applicativi.

```sql
alter table public.app_users enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.app_user_wallets enable row level security;
alter table public.app_audit_events enable row level security;

create policy "users can read own app profile"
  on public.app_users for select
  using (auth.uid() = id);

create policy "users can read own wallets"
  on public.app_user_wallets for select
  using (auth.uid() = user_id);
```

**Step 3: Seed iniziale amministratori**

Inserire solo email esplicitamente approvate dall’utente. Non hardcodare email personali nel codice sorgente. Per bootstrap usare variabili ambiente oppure una query manuale nel connettore Supabase dopo aver creato l’utente Auth.

## Task 2: Creare helper server-side per sessione email e RBAC

**Files:**

- Create: `app/src/lib/app-auth/session.ts`
- Create: `app/src/lib/app-auth/rbac.ts`
- Modify: `app/src/lib/supabase-server.ts`

**Step 1: Aggiungere client server anon per validare JWT utente**

Il client service role serve per leggere tabelle protette, ma la sessione utente va validata dal token Supabase inviato dal browser. Implementare un helper che estragga `Authorization: Bearer <token>` e chiami `supabase.auth.getUser(token)`.

**Step 2: Implementare `getEmailActorFromRequest`**

Output atteso:

```ts
export type EmailActor = {
  kind: 'email';
  userId: string;
  email: string;
  roles: AppPermissionRole[];
};
```

La funzione deve fallire chiusa se manca token, se Supabase non è configurato, se l’utente non esiste in `app_users`, se `status != 'active'`, o se non ha i ruoli richiesti.

**Step 3: Implementare controllo permessi**

```ts
export type AppPermissionRole = 'admin' | 'kyb_operator' | 'role_manager' | 'viewer';

export function hasAnyRole(actor: EmailActor, roles: AppPermissionRole[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}
```

## Task 3: Estendere autenticazione KYB da wallet-only a dual auth

**Files:**

- Modify: `app/src/lib/kyb/auth.ts`
- Modify: `app/src/lib/kyb/schema.ts`
- Modify: `app/src/app/api/kyb/applications/route.ts`
- Modify: `app/src/app/api/kyb/applications/[id]/review/route.ts`

**Step 1: Definire tipo attore unificato**

```ts
export type OperatorActor =
  | { kind: 'wallet'; address: `0x${string}` }
  | { kind: 'email'; userId: string; email: string; roles: AppPermissionRole[] };
```

**Step 2: Creare `verifyOperatorRequest`**

La funzione deve accettare due canali:

1. Se ci sono header wallet `x-kyb-address`, `x-kyb-timestamp`, `x-kyb-signature`, usa l’attuale `verifyOperatorAuth`.
2. Altrimenti cerca `Authorization: Bearer <token>` e valida sessione email con ruolo `admin` o `kyb_operator`.

Per review KYB via email, il nonce wallet non è necessario perché il JWT Supabase e il server-side RBAC proteggono la richiesta. Per mantenere tracciabilità, l’audit deve registrare `actor_user_id`/email oltre a `actor_address` quando disponibile.

**Step 3: Non degradare la sicurezza on-chain**

L’approvazione KYB via email resta “instructional only”. Non deve chiamare `ComplianceRegistry.setWhitelist` dal server in questa fase. La UI deve mostrare chiaramente che l’approvazione off-chain non equivale a whitelist on-chain finché la transazione non viene firmata.

## Task 4: Aggiornare client Supabase Auth e UI login email

**Files:**

- Create: `app/src/components/auth/EmailLoginPanel.tsx`
- Create: `app/src/hooks/useEmailSession.ts`
- Modify: `app/src/components/shared/Providers.tsx`
- Modify: `app/src/components/shared/Header.tsx`
- Modify: `app/src/components/shared/WalletRoleIndicator.tsx`

**Step 1: Implementare hook sessione**

`useEmailSession` deve leggere `supabase.auth.getSession()`, sottoscrivere `onAuthStateChange`, esporre `session`, `user`, `accessToken`, `signInWithOtp(email)`, `signOut()`.

**Step 2: Implementare login magic link/OTP email**

Usare Supabase Auth email OTP/magic link. La UI deve essere chiara: “Accesso admin via email” è distinto da “Connessione wallet”.

**Step 3: Caricare profilo RBAC applicativo**

Aggiungere endpoint `GET /api/app/me` che restituisce:

```json
{
  "user": { "id": "...", "email": "..." },
  "roles": ["admin", "kyb_operator"],
  "wallets": ["0x..."]
}
```

Il client usa questo endpoint, non legge direttamente tutte le tabelle RBAC.

## Task 5: Estendere `useWalletRole` a identità ibrida

**Files:**

- Modify: `app/src/components/shared/WalletRoleIndicator.tsx`
- Modify: `app/src/components/shared/Header.tsx`

**Step 1: Rinominare concettualmente `useWalletRole`**

Per compatibilità si può mantenere il nome inizialmente, ma creare un nuovo hook `useAppAccessRole` sarebbe più corretto. Il nuovo hook deve valutare prima l’accesso email autorizzato, poi l’accesso wallet on-chain.

**Step 2: Regole di risoluzione ruolo**

| Condizione | Ruolo UI |
|---|---|
| Email session con `admin` | `admin` |
| Email session con `kyb_operator` | `admin` limitato al KYB, oppure nuovo sub-ruolo interno |
| Wallet con `OWNER_ROLE`/`SENTINEL_ROLE` | `admin` |
| Wallet con cedant/curator/LP | ruolo esistente |
| Nessuna sessione e nessun wallet | `none` |

**Step 3: Mostrare badge identità**

Il badge deve indicare se l’accesso è via email, wallet o entrambi. Questo evita confusione quando la UI consente review ma la transazione on-chain richiede ancora wallet.

## Task 6: Aggiornare KYB Review Queue per funzionare anche senza wallet

**Files:**

- Modify: `app/src/components/admin/KybReviewQueue.tsx`

**Step 1: Lista pratiche via email session**

Se l’utente ha sessione email con ruolo `admin` o `kyb_operator`, `loadQueue` deve chiamare `/api/kyb/applications` con `Authorization: Bearer <token>` invece di richiedere firma wallet.

**Step 2: Review via email session**

Se l’utente è email-authenticated, `review` deve inviare il payload senza `auth` wallet, oppure con un discriminatore `authMode: 'email'`. Lo schema server deve accettare questa modalità solo se la sessione è valida.

**Step 3: Transazione finale whitelist**

Dopo approvazione, continuare a generare calldata Safe-ready o direct wallet flow se wallet connesso e autorizzato. In questa fase non introdurre relayer automatico.

## Task 7: Aggiornare Role Handoff Panel

**Files:**

- Modify: `app/src/components/admin/RoleHandoffPanel.tsx`

**Step 1: Lettura lista approvati via email**

Sostituire il blocco “devi firmare per caricare lista” con dual auth: se token email presente e autorizzato, usare `Authorization`.

**Step 2: Direct grant resta wallet-only**

Il bottone `grantRole` diretto deve rimanere abilitato solo quando c’è wallet con `OWNER_ROLE`. L’admin email può generare comandi/call data, ma non può firmare.

**Step 3: Aggiungere preset per nuovo wallet**

Aggiungere un aiuto UI per target `0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e` e ruoli consigliati. Evitare hardcode permanente se l’indirizzo è solo staging; preferire config o input.

## Task 8: Istruzioni on-chain per aggiungere `0x810f...0F3e`

**Files:**

- Create: `app/scripts/prepare_role_grants_readonly.mjs`
- Modify: `live_whitelist_test_notes_2026-06-15.md`

**Step 1: Verificare stato ruoli del nuovo wallet**

Eseguire solo letture `hasRole` per ruoli rilevanti:

- `OWNER_ROLE`
- `KYC_OPERATOR_ROLE`
- eventuale `SENTINEL_ROLE`, `CEDANT_ROLE`, `CURATOR_ROLE`, `ALLOCATOR_ROLE` se presenti in `ProtocolRoles.sol`

**Step 2: Preparare comandi `cast send`**

Comandi da eseguire nel terminale del proprietario/deployer, non da incollare con private key in chat:

```bash
cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address)" \
  $(cast keccak "KYC_OPERATOR_ROLE") \
  0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>

cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address)" \
  $(cast keccak "OWNER_ROLE") \
  0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>
```

**Step 3: Funding gas**

Se `0x810f...0F3e` dovrà firmare da browser/admin, finanziare con ETH Base Sepolia. Se sarà solo wallet collegato a un account email ma non firmerà, il funding è meno urgente.

## Task 9: Test e verifiche

**Files:**

- Create: `app/scripts/hybrid-auth-smoke.ts` oppure test equivalente
- Modify: `app/package.json` solo se si aggiunge uno script esplicito

**Step 1: Test unitari per helper RBAC**

Verificare:

- utente senza token viene respinto;
- utente disabilitato viene respinto;
- `viewer` non può fare review;
- `kyb_operator` può listare/review;
- `admin` può listare/review;
- wallet auth esistente continua a funzionare.

**Step 2: Smoke API locale**

Eseguire:

```bash
pnpm lint
pnpm build
```

**Step 3: Verifica on-chain read-only**

Eseguire script per ruoli `0x6495...228dB` e `0x810f...0F3e`, salvando JSON risultato senza segreti.

## Task 10: Criteri di completamento

La feature può essere considerata pronta solo quando tutte queste condizioni sono vere:

| Criterio | Verifica |
|---|---|
| Login email funziona | Supabase Auth restituisce sessione e `/api/app/me` mostra ruoli |
| Admin panel accessibile senza wallet | `/app/admin` non blocca se email user ha `admin` |
| KYB list funziona senza firma wallet | GET `/api/kyb/applications` con Bearer token autorizzato ritorna lista |
| KYB review funziona senza firma wallet | POST review con Bearer token autorizzato cambia stato e scrive audit |
| Wallet auth non regressa | Flusso firma wallet esistente continua a funzionare |
| On-chain write resta sicura | `grantRole` e `setWhitelist` non vengono firmati dal server senza relayer approvato |
| Nuovo wallet verificato | `0x810f...0F3e` ha ruoli attesi dopo `grantRole` |
| Build passa | `pnpm lint` e `pnpm build` senza errori bloccanti |

## Nota su cosa non implementare in questa fase

Non implementare subito un server-side relayer per `setWhitelist` o `grantRole`, perché introdurrebbe gestione di chiavi private lato server, policy di spending, rate limit, allowlist di funzioni, monitoraggio e rotazione chiavi. Se l’utente conferma esplicitamente che vuole “firmare tutto via email senza wallet”, aprire un piano separato per un **testnet relayer controllato** o per un **Safe module**.

---

Plan complete and saved to `docs/plans/2026-06-15-hybrid-email-wallet-rbac.md`. Two execution options:

**1. Subagent-Driven (this session)** — task-by-task in questa sessione, con review e verifica dopo ogni blocco.

**2. Parallel Session (separate)** — aprire una nuova sessione dedicata usando questo piano come handoff operativo.

Raccomandazione: procedere con l’opzione 1 per mantenere continuità con le verifiche on-chain già fatte e con il contesto NextBlock corrente.
