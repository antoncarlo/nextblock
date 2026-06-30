# Report consegna — Accesso ibrido email-wallet e RBAC NextBlock

**Autore:** Manus AI**Data:** 2026-06-15**Repository:** `/home/ubuntu/nextblock_onchain/nextblock`**Ambito:** app NextBlock, pannello admin, KYB review, RBAC applicativo Supabase, verifica read-only ruoli Base Sepolia.

## Sintesi esecutiva

È stata implementata una prima versione funzionante del modello di accesso ibrido **email + wallet**. L’obiettivo era ridurre la dipendenza operativa dal solo wallet per consultare e gestire l’area admin/KYB, mantenendo però le azioni on-chain protette da firma wallet. La modifica consente a una sessione email Supabase Auth autorizzata di accedere al pannello `/app/admin` e alle route KYB operative senza richiedere ogni volta una firma wallet, mentre `grantRole`, `setWhitelist` e qualsiasi transazione blockchain restano fuori dal perimetro email-only.

L’email `antoncarlo1995@gmail.com` è stata predisposta nella migrazione RBAC come utente ad alto privilegio applicativo con ruoli `admin`, `kyb_operator`, `reviewer` e `support`. Non è stata salvata alcuna password nel repository o nel database applicativo. Il login supporta sia password Supabase Auth sia magic link; la password va quindi configurata in Supabase Auth, non hardcoded nel codice.

## Cosa è stato implementato

| Area | Stato | Dettaglio |
| --- | --- | --- |
| RBAC applicativo Supabase | Completato | Aggiunte tabelle `app_users`, `app_user_roles`, `app_user_wallets` con RLS abilitata e bootstrap per `antoncarlo1995@gmail.com`. |
| Login email client-side | Completato | Aggiunto provider React per Supabase Auth, token sessione, ruoli applicativi e login via password opzionale o magic link. |
| Endpoint profilo sessione | Completato | Aggiunto `/api/app/me`, che valida il token Supabase lato server e restituisce profilo, ruoli e wallet collegati. |
| Header e UI accesso | Completato | Aggiunto controllo email accanto al wallet e visualizzazione delle voci admin anche per sessione email admin. |
| Gate `/app/admin` | Completato | Il pannello admin ora accetta wallet autorizzato oppure sessione email con ruoli applicativi adeguati. |
| KYB API | Completato | Le route lista e review supportano sia firma wallet sia bearer token Supabase verificato lato server. |
| Audit KYB | Completato | La review KYB distingue `auth_method=wallet` e `auth_method=email` e registra l’attore applicativo dove disponibile. |
| Azioni on-chain | Protette | Nessuna firma automatica via email: le transazioni blockchain richiedono ancora wallet e ruoli on-chain. |

## File principali modificati o aggiunti

| File | Tipo modifica | Scopo |
| --- | --- | --- |
| `app/supabase/migrations/202606150001_hybrid_email_wallet_rbac.sql` | Nuovo | Schema RBAC applicativo, trigger bootstrap email autorizzata e colonne audit KYB. |
| `app/src/lib/app-auth/session.ts` | Nuovo | Validazione server-side token Supabase, caricamento profilo, ruoli e wallet. |
| `app/src/app/api/app/me/route.ts` | Nuovo | Endpoint per stato sessione email autorizzata. |
| `app/src/hooks/useEmailSession.tsx` | Nuovo | Provider client email, login password/magic link, logout e stato ruoli. |
| `app/src/components/shared/EmailAuthControls.tsx` | Nuovo | UI login/logout email con badge ruoli. |
| `app/src/components/shared/Providers.tsx` | Modificato | Monta il provider email accanto ai provider wallet esistenti. |
| `app/src/components/shared/Header.tsx` | Modificato | Mostra navigazione admin anche per sessione email autorizzata. |
| `app/src/app/app/admin/page.tsx` | Modificato | Gate ibrido email-wallet per pannello admin. |
| `app/src/app/api/kyb/applications/route.ts` | Modificato | Fallback email autorizzato per lista KYB. |
| `app/src/app/api/kyb/applications/[id]/review/route.ts` | Modificato | Review KYB via wallet firmato o sessione email verificata. |
| `app/src/components/admin/KybReviewQueue.tsx` | Modificato | Usa token email quando non si opera tramite firma wallet. |
| `app/src/lib/kyb/schema.ts` | Modificato | Payload review compatibile con percorso email server-verified. |
| `app/src/lib/supabase-server.ts` | Modificato | Client anon server-side per validare token Supabase Auth. |
| `app/scripts/prepare_role_grants_readonly.mjs` | Nuovo | Verifica read-only ruoli e genera piano `grantRole` senza firmare. |
| `docs/plans/2026-06-15-hybrid-email-wallet-rbac.md` | Nuovo | Piano tecnico architetturale dell’accesso ibrido. |

## Verifiche eseguite

Le verifiche sono state completate localmente senza usare chiavi private e senza firmare transazioni. Il wrapper `pnpm build` tenta un’installazione bloccata dalla policy locale di script approvati; per questo la build completa è stata eseguita correttamente tramite il binario locale di Next.js.

| Verifica | Comando | Esito |
| --- | --- | --- |
| TypeScript | `./node_modules/.bin/tsc --noEmit` | PASS |
| ESLint mirato sui file modificati | `./node_modules/.bin/eslint ...` | PASS |
| Build Next.js | `./node_modules/.bin/next build` | PASS |
| Verifica ruoli on-chain read-only | `node scripts/prepare_role_grants_readonly.mjs` | PASS |
| Controllo secret nel repository | ricerca mirata chiave privata fornita | PASS, nessuna occorrenza nel repository |

## Stato on-chain Base Sepolia

La verifica read-only è stata eseguita su Base Sepolia (`chainId=84532`) al blocco `42877276`. Nessuna transazione è stata firmata o inviata.

| Wallet | Saldo Base Sepolia | `OWNER_ROLE` | `KYC_OPERATOR_ROLE` | Stato operativo |
| --- | --- | --- | --- | --- |
| `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2` | `0.194755873179288659 ETH` | `true` | `true` | Deployer/owner abilitato a concedere ruoli. |
| `0x6495280c365b372230A275C8Fec6724e3FC228dB` | `0 ETH` | `false` | `false` | Mancano ruoli; serve anche funding se dovrà firmare transazioni. |
| `0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e` | `0.113352230325590139 ETH` | `false` | `false` | Mancano ruoli; il saldo testnet è sufficiente per firmare dopo i grant. |

## Comandi on-chain da eseguire 

Questi comandi devono essere eseguiti dal terminale del proprietario/deployer, con la chiave del wallet `0xfF6f0d49dD2187351264C4d3bbd5537bE8Ad81d2`. Non incollare chiavi in chat e non salvarle nel repository.

```bash
# 0x6495...228dB — KYC_OPERATOR_ROLE
cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address)" \
  $(cast keccak "KYC_OPERATOR_ROLE") \
  0x6495280c365b372230A275C8Fec6724e3FC228dB \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>

# 0x6495...228dB — OWNER_ROLE
cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address )" \
  $(cast keccak "OWNER_ROLE") \
  0x6495280c365b372230A275C8Fec6724e3FC228dB \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>

# 0x810f...0F3e — KYC_OPERATOR_ROLE
cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address )" \
  $(cast keccak "KYC_OPERATOR_ROLE") \
  0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>

# 0x810f...0F3e — OWNER_ROLE
cast send 0xEE93166a2cf213243eF330a664682290b195c976 \
  "grantRole(bytes32,address )" \
  $(cast keccak "OWNER_ROLE") \
  0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e \
  --rpc-url https://sepolia.base.org \
  --private-key <CHIAVE_DEPLOYER_NEL_TUO_TERMINALE>
```

Dopo l’esecuzione dei quattro comandi, va rilanciato lo script read-only:

```bash
cd /home/ubuntu/nextblock_onchain/nextblock/app
node scripts/prepare_role_grants_readonly.mjs
```

L’esito atteso è che `OWNER_ROLE` e `KYC_OPERATOR_ROLE` risultino `true` per entrambi i wallet `0x6495...228dB` e `0x810f...0F3e`.

## Passi necessari per rendere attivo l’accesso email in ambiente live

Per completare l’attivazione live occorre applicare la migrazione Supabase e creare o invitare l’utente Auth con email `antoncarlo1995@gmail.com`. La migrazione non salva password; quando l’utente viene creato in `auth.users`, il trigger di bootstrap crea/aggiorna automaticamente il profilo applicativo e assegna tutti i ruoli previsti.

| Passo | Azione | Nota di sicurezza |
| --- | --- | --- |
| 1 | Applicare `app/supabase/migrations/202606150001_hybrid_email_wallet_rbac.sql` al progetto Supabase corretto. | Verificare ambiente staging/production prima dell’applicazione. |
| 2 | Creare/invitare `antoncarlo1995@gmail.com` in Supabase Auth oppure usare magic link. | La password deve vivere solo in Supabase Auth, mai nel repository. |
| 3 | Eseguire deploy dell’app aggiornata. | Impostare correttamente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| 4 | Accedere a `/app/admin` con email. | Le funzioni off-chain KYB/admin saranno disponibili in base ai ruoli applicativi. |
| 5 | Per transazioni on-chain, connettere wallet autorizzato. | L’email non firma e non spende gas. |

## Limiti e decisioni di sicurezza

La scelta deliberata è separare i privilegi applicativi dai privilegi on-chain. L’email ad alto privilegio può vedere e gestire le funzioni off-chain dell’app, compresa la review KYB se il database è configurato, ma non può firmare `grantRole`, `setWhitelist` o qualunque transazione. Questo evita che una compromissione email si trasformi automaticamente in capacità di spesa gas o controllo smart contract.

La richiesta di una password “più o meno” non è stata implementata come password hardcoded o salvata in chiaro. Il codice supporta password login solo se l’utente esiste in Supabase Auth con una password impostata tramite i canali corretti; in alternativa, il magic link permette di evitare completamente la gestione manuale della password.

## Artefatti allegabili

| File | Contenuto |
| --- | --- |
| `/home/ubuntu/nextblock_onchain/reports/hybrid_email_wallet_rbac_verification_2026-06-15.md` | Log sintetico delle verifiche finali PASS e snapshot ruoli on-chain. |
| `/home/ubuntu/nextblock_onchain/reports/admin_operator_grants_readonly_2026-06-15.json` | Output read-only con ruoli, saldi e piano grantRole. |
| `/home/ubuntu/nextblock_onchain/live_whitelist_test_notes_2026-06-15.md` | Note operative cumulative della sessione. |
| `/home/ubuntu/nextblock_onchain/nextblock/docs/plans/2026-06-15-hybrid-email-wallet-rbac.md` | Piano tecnico architetturale. |
| `/home/ubuntu/nextblock_onchain/nextblock/app/supabase/migrations/202606150001_hybrid_email_wallet_rbac.sql` | Migrazione database da applicare a Supabase. |

