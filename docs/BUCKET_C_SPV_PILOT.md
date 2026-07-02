# Bucket C — Spec del ponte legale per il test pilota (SPV + trattato)

**A chi serve.** All'owner e ai legali. Il software NextBlock è reale
end-to-end (tempo on-chain, documenti hashati e custoditi, capitale USDC
earmarked, claim con liveness/committee), ma **nessuna riga di codice rende
vero il rischio sottostante**: quello lo fa solo un wrapper legale. Questo
documento specifica il minimo indispensabile perché il test della compagnia
sia *veritiero* — rischio reale, per quanto piccolo — e non una simulazione
su software vero.

**Cosa NON è.** Non è un parere legale né un prospetto: è la specifica
tecnico-operativa da portare ai legali, con la mappatura esatta
legale ↔ on-chain. Giurisdizione, regime autorizzativo e fiscalità sono
scelte dei legali.

---

## 1. Principio

On-chain vive il **riferimento** al rischio (hash + parametri economici) e il
**capitale** che lo backa. Il collegamento vincolante tra i due è il
**trattato di riassicurazione** stipulato da un veicolo segregato. Senza
trattato, l'earmark del vault è solo contabilità interna; col trattato,
diventa capacity riassicurativa opponibile.

## 2. Il veicolo (SPV / cella segregata)

Opzioni standard, in ordine di velocità per un pilota:

| Opzione | Pro | Contro |
|---|---|---|
| **Cella di una PCC/SAC esistente** (protected cell company, es. Guernsey/Malta/Bermuda) | veloce (settimane), costi contenuti, segregazione per legge | serve un cell-sponsor; governance condivisa |
| **Transformer riassicurativo** (veicolo autorizzato che "trasforma" capitale in capacity) | licenza già esistente, adatto a collateralized re | fee del transformer; dipendenza da terzi |
| **SPV dedicata (ISPV / captive)** | controllo totale, riusabile post-pilota | autorizzazione ad hoc: tempi e capitale minimi maggiori |

Requisiti indipendenti dall'opzione: (a) **segregazione patrimoniale** della
cella/veicolo rispetto ad altri rischi; (b) capacità giuridica di **assumere
rischio riassicurativo** nella giurisdizione scelta (direttamente o via
fronting); (c) possibilità di detenere **USDC** o un conto collateral
equivalente (vedi §5).

## 3. Il trattato pilota

Dimensione consigliata: **una singola polizza o un layer quota-share
piccolo** (coerente col percorso già implementato: bordereau → portfolio →
policy singola in `PolicyRegistry`).

Clausole che DEVONO specchiare lo stato on-chain (fonte di verità unica):

| Clausola del trattato | Valore on-chain corrispondente |
|---|---|
| Limite / capacity | `coverageLimit` del portfolio in `PortfolioRegistry` |
| Premio ceduto | `cededPremium` (USDC 6 decimali) |
| Periodo di copertura | `inceptionTime` / `expiryTime` |
| Struttura (QS/XoL/…) | `structureType` |
| Identificazione del portafoglio | `documentHash` (keccak256 del bordereau reale) + `metadataURI` (manifest IPFS pubblico) |
| Procedura sinistri | lifecycle di `ClaimManager`: submission → assessment (advisory) → liveness/dispute → approvazione Claims Committee → payout USDC |
| Collateral / funding | allocazione earmarked del vault (`allocateToPortfolio`) |

Regola redazionale: il trattato **richiama gli identificativi on-chain**
(chain id 84532/8453, indirizzi contratti, portfolioId, documentHash) come
allegato tecnico, così ogni disputa fattuale ha un'ancora verificabile.

## 4. Mappatura ruoli legale ↔ on-chain

| Ruolo legale | Ruolo on-chain | Note |
|---|---|---|
| SPV/cella (riassicuratore) | wallet con `AUTHORIZED_CEDANT_ROLE` | firma submit portfolio, paga/riceve USDC |
| Compagnia cedente | controparte del trattato (off-chain) | nel pilota può coincidere col gruppo dell'owner |
| Managing agent / underwriter | `UNDERWRITING_CURATOR_ROLE` | approva portfolio, setta expected loss |
| Organo amministrativo del veicolo | **Safe multisig** (`0x8Fd8…F870`) + `ProtocolTimelock` | eseguire prima la GovernanceMigration (v. `contracts/REDEPLOY_RUNBOOK.md`) |
| Comitato sinistri | `CLAIMS_COMMITTEE_ROLE` | delibere claim = atti del comitato |
| Investitori | Institutional LP whitelisted (`ComplianceRegistry`) | v. §6 sul titolo nbUSDC |

## 5. Flusso operativo end-to-end del pilota

1. Costituzione cella/SPV + apertura wallet dedicato (custodia: v. sotto).
2. Grant `AUTHORIZED_CEDANT_ROLE` al wallet SPV (via Safe post-migrazione).
3. Firma del trattato con allegato tecnico on-chain (§3).
4. Upload bordereau reale → hash + manifest + submit portfolio (pipeline già live).
5. Curator: due diligence + approve + activate.
6. LP depositano USDC → allocazione capacity al portfolio (curator-parametrizzata).
7. SPV versa il **premio ceduto in USDC** → split distributor → UPR matura su tempo reale (`lockRealTime` attivo).
8. (Se sinistro) claim on-chain con documentazione nel bucket evidence → committee → payout USDC all'SPV → pagamento al cedente sotto il trattato.
9. Scadenza → redemption LP via coda a finestre.

Custodia del wallet SPV: per il pilota su testnet basta un hardware wallet
dell'organo amministrativo; per mainnet prevedere custodian qualificato
(Fireblocks/Copper/equivalente) — requisito tipico degli LP istituzionali.

## 6. Checklist documenti per i legali

- [ ] Atto costitutivo/regolamento della cella o SPV (con clausola di segregazione)
- [ ] **Trattato di riassicurazione pilota** con allegato tecnico on-chain (§3)
- [ ] Collateral/security agreement che riconosce l'earmark on-chain come funding del trattato (o conto collateral specchio, se richiesto dal regolatore)
- [ ] Parere sulla qualificazione di **nbUSDC** (strumento finanziario / quota di fondo / titolo partecipativo) nella giurisdizione target e regime di offerta a investitori qualificati
- [ ] KYC/AML policy del veicolo (il gate on-chain `ComplianceRegistry` è l'enforcement, non la policy)
- [ ] Data protection: il bordereau contiene dati di assicurati — flusso già conforme by-design (documento in bucket privato, on-chain solo hash + manifest non sensibile), da recepire nella privacy policy
- [ ] (Se richiesto) accordo di fronting con riassicuratore autorizzato

## 7. Cosa il software garantisce già / cosa resta fuori

**Garantito dal protocollo:** integrità documentale verificabile (hash),
tempo non manipolabile (post `lockRealTime`), capitale non ridistribuibile
fuori dalle regole (compliance gate, buffer, coda redemption), sinistri non
pagabili senza liveness+committee, audit trail completo.

**Fuori dal software (responsabilità del wrapper legale):** l'opponibilità
del trattato, l'autorizzazione ad assumere rischio, la qualificazione
regolamentare di nbUSDC, la fiscalità, l'enforcement giudiziario. E resta il
**Bucket B** (feed dati reali: Braino NAV/risk, UMA con bond, KYC provider)
per la parte informativa.

## 8. Percorso minimo consigliato per il pilota

Cella PCC in giurisdizione riassicurativa consolidata + trattato QS su
singola polizza a limite basso + fronting se il cedente richiede rating.
Timeline realistica: 4–8 settimane legali in parallelo al redeploy tecnico
(`contracts/REDEPLOY_RUNBOOK.md`), che è questione di ore.
