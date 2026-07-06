'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useVaultAddresses } from '@/hooks/useVaultData';
import { operatorAuthMessage } from '@/lib/kyb/schema';
import {
  RISK_GRADES,
  validateOfferingTerms,
  formatApyRangeBps,
  type OfferingTerms,
  type RiskGrade,
} from '@/lib/offering/terms';

/**
 * Curator console: publish/update vault offering terms.
 *
 * Writes require an EIP-191 signature over `offering-terms:put:<vault>` and
 * the on-chain UNDERWRITING_CURATOR_ROLE (or OWNER_ROLE) — enforced by the
 * API route, never by this page. Published terms replace the illustrative
 * defaults in the vault table and detail page, labeled "Curated".
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'signing' }
  | { kind: 'saving' }
  | { kind: 'saved'; vault: string }
  | { kind: 'error'; message: string };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  color: '#0F1218',
  background: '#FFFFFF',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6B7280',
  marginBottom: 6,
};

export default function OfferingTermsPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: vaultAddresses } = useVaultAddresses();

  const [existing, setExisting] = useState<Map<string, OfferingTerms>>(new Map());
  const [vault, setVault] = useState('');
  const [managerName, setManagerName] = useState('');
  const [strategy, setStrategy] = useState('');
  const [riskGrade, setRiskGrade] = useState<RiskGrade>('MODERATE');
  const [minPct, setMinPct] = useState('8');
  const [maxPct, setMaxPct] = useState('12');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch('/api/app/offering-terms');
      if (!res.ok) return;
      const json = (await res.json()) as { terms: OfferingTerms[] };
      const map = new Map<string, OfferingTerms>();
      for (const t of json.terms ?? []) map.set(t.vaultAddress.toLowerCase(), t);
      setExisting(map);
    } catch {
      // list stays empty; publishing still works
    }
  }, []);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  // Prefill the form when selecting a vault that already has terms.
  useEffect(() => {
    const t = existing.get(vault.toLowerCase());
    if (t) {
      setManagerName(t.managerName);
      setStrategy(t.strategyStatement);
      setRiskGrade(t.riskGrade);
      setMinPct(String(t.targetApyMinBps / 100));
      setMaxPct(String(t.targetApyMaxBps / 100));
    }
  }, [vault, existing]);

  async function save() {
    if (!isConnected || !address) {
      setPhase({ kind: 'error', message: 'Connect the curator wallet first.' });
      return;
    }
    const input = {
      vaultAddress: vault.trim().toLowerCase(),
      managerName: managerName.trim(),
      strategyStatement: strategy.trim(),
      riskGrade,
      targetApyMinBps: Math.round(Number(minPct) * 100),
      targetApyMaxBps: Math.round(Number(maxPct) * 100),
    };
    const validated = validateOfferingTerms(input);
    if (!validated.ok) {
      setPhase({ kind: 'error', message: validated.errors.join('; ') });
      return;
    }
    setPhase({ kind: 'signing' });
    const ts = Math.floor(Date.now() / 1000);
    let signature: `0x${string}`;
    try {
      signature = await signMessageAsync({
        message: operatorAuthMessage(`offering-terms:put:${validated.value.vaultAddress}`, ts),
      });
    } catch {
      setPhase({ kind: 'error', message: 'Signature declined.' });
      return;
    }
    setPhase({ kind: 'saving' });
    try {
      const res = await fetch('/api/app/offering-terms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terms: validated.value,
          auth: { address, timestamp: ts, signature },
        }),
      });
      const json = (await res.json()) as { error?: string; details?: string[] };
      if (!res.ok) {
        setPhase({ kind: 'error', message: json.details?.join('; ') ?? json.error ?? `HTTP ${res.status}` });
        return;
      }
      setPhase({ kind: 'saved', vault: validated.value.vaultAddress });
      void loadExisting();
    } catch {
      setPhase({ kind: 'error', message: 'Network error while saving.' });
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', padding: '40px 32px' }}>
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Curator console</p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#0F1218', marginBottom: 8 }}>
          Vault offering terms
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', marginBottom: 28, lineHeight: 1.6 }}>
          Published terms replace the illustrative defaults in the vault list and detail page and
          are labeled <strong>Curated</strong>. Saving requires the on-chain Underwriting Curator
          (or Owner) role — the API re-verifies the signature and the role on every write.
        </p>

        <div className="card-institutional" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle} htmlFor="ot-vault">Vault</label>
            <select id="ot-vault" style={inputStyle} value={vault} onChange={(e) => setVault(e.target.value)}>
              <option value="">Select a vault…</option>
              {(vaultAddresses ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}{existing.has(a.toLowerCase()) ? ' — has published terms' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="ot-manager">Manager name</label>
            <input id="ot-manager" style={inputStyle} maxLength={80} value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Klapton Re Partners Ltd" />
          </div>
          <div>
            <label style={labelStyle} htmlFor="ot-strategy">Strategy statement</label>
            <textarea id="ot-strategy" style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} maxLength={280} value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="One or two sentences on the underwriting strategy" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle} htmlFor="ot-grade">Risk grade</label>
              <select id="ot-grade" style={inputStyle} value={riskGrade} onChange={(e) => setRiskGrade(e.target.value as RiskGrade)}>
                {RISK_GRADES.map((g) => (
                  <option key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="ot-min">Target APY min (%)</label>
              <input id="ot-min" style={inputStyle} type="number" min={0} max={50} step={0.5} value={minPct} onChange={(e) => setMinPct(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle} htmlFor="ot-max">Target APY max (%)</label>
              <input id="ot-max" style={inputStyle} type="number" min={0} max={50} step={0.5} value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
            </div>
          </div>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#9A9A9A', margin: 0 }}>
            Shown as: <strong>{formatApyRangeBps(Math.round(Number(minPct || '0') * 100), Math.round(Number(maxPct || '0') * 100))}</strong> — an
            illustrative target, never presented as promised yield.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={() => void save()}
              disabled={phase.kind === 'signing' || phase.kind === 'saving'}
              style={{
                padding: '12px 28px',
                background: '#1B3A6B',
                color: '#FFFFFF',
                borderRadius: 50,
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                cursor: phase.kind === 'signing' || phase.kind === 'saving' ? 'wait' : 'pointer',
                opacity: phase.kind === 'signing' || phase.kind === 'saving' ? 0.6 : 1,
              }}
            >
              {phase.kind === 'signing' ? 'Sign in wallet…' : phase.kind === 'saving' ? 'Saving…' : 'Sign & publish'}
            </button>
            {phase.kind === 'saved' && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#166534' }}>
                Published for {phase.vault.slice(0, 10)}… — live in the vault list.
              </span>
            )}
            {phase.kind === 'error' && (
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#991B1B' }}>{phase.message}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
