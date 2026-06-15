# TODO — feat/kyb-durable-state

## Scope autorizzato

Questo branch implementa stato durevole Supabase per nonce KYB single-use e rate-limit KYB. La migration resta **versionata soltanto localmente** finché il proprietario non autorizza esplicitamente l’applicazione al Supabase remoto. Non sono autorizzati merge, redeploy o modifiche Vercel.

## Checklist

| Stato | Attività | Evidenza attesa |
|---|---|---|
| Fatto | Test RED/GREEN durable state | `node --experimental-strip-types scripts/kyb-durable-state-smoke.ts` passa dopo implementazione |
| Fatto | Migration `0002_kyb_durable_state` | `supabase/migrations/20260614214000_0002_kyb_durable_state.sql` contiene `kyb_operator_nonces`, `kyb_rate_limit_windows`, RPC `kyb_consume_rate_limit` |
| Fatto | Store TypeScript asincroni | `createSupabaseNonceStore`, `createSupabaseRateLimitStore`, fallback locale e API asincrone |
| Fatto | Wiring route KYB | Endpoint nonce, submit e review usano store durevole quando Supabase è disponibile |
| Fatto | Smoke anti-replay e schema review | `kyb-smoke.ts` copre binding nonce e validazione richiesta review; `kyb-durable-state-smoke.ts` copre single-use e RPC |
| Fatto | Smoke/build | `kyb-smoke`, `kyb-durable-state-smoke` e `npm run build` passano |
| Bloccato fuori scope | Lint repository completo | `npm run lint` fallisce su 3 errori preesistenti `react-hooks/set-state-in-effect` in `app/src/app/app/pilot/page.tsx`, `app/src/components/landing/ui/carousel.tsx`, `app/src/hooks-landing/use-mobile.tsx`; nessuna occorrenza lint sui file KYB modificati |
| Fatto | Commit branch | Commit locale su `feat/kyb-durable-state`, senza push, merge né deploy |
