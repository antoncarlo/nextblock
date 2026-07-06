'use client';
import { useMemo, useState } from 'react';
import { NEXTBLOCK_ADDRESSES, NEXTBLOCK_CHAIN_ID } from '@/config/generated/addressBook';
import {
  PROTOCOL_ROLES,
  buildGrantRoleOperation,
  buildRevokeRoleOperation,
  buildRawOperation,
  buildOperationBatches,
  type ProtocolRoleName,
  type TimelockOperation,
} from '@/lib/governance/timelock';

/**
 * Governance execution console — Safe → timelock → protocol.
 *
 * Builds the two Safe Transaction-Builder batches (schedule now, execute
 * after the delay) for owner-gated operations, plus the operation id to
 * track on-chain. Pure encoding: authority stays with the timelock's
 * proposers (the protocol Safe) — this page cannot execute anything.
 */

type OpKind = 'grant' | 'revoke' | 'raw';

const SAFE_APP_URL = `https://app.safe.global/apps/open?safe=basesep:${NEXTBLOCK_ADDRESSES.safe}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`;

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

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x[0-9a-fA-F]*$/;

export default function GovernancePage() {
  const [kind, setKind] = useState<OpKind>('grant');
  const [role, setRole] = useState<ProtocolRoleName>('UNDERWRITING_CURATOR_ROLE');
  const [account, setAccount] = useState('');
  const [rawLabel, setRawLabel] = useState('');
  const [rawTarget, setRawTarget] = useState('');
  const [rawData, setRawData] = useState('');
  const [delayHours, setDelayHours] = useState('24');

  const { op, error } = useMemo((): { op: TimelockOperation | null; error: string | null } => {
    try {
      if (kind === 'raw') {
        if (!rawLabel.trim()) return { op: null, error: 'Label required for the raw operation.' };
        if (!ADDRESS_RE.test(rawTarget.trim())) return { op: null, error: 'Raw target must be a 0x…40-hex address.' };
        if (!HEX_RE.test(rawData.trim()) || rawData.trim().length < 10) {
          return { op: null, error: 'Raw calldata must be 0x-hex (selector + args).' };
        }
        return { op: buildRawOperation(rawLabel.trim(), rawTarget.trim() as `0x${string}`, rawData.trim() as `0x${string}`), error: null };
      }
      if (!ADDRESS_RE.test(account.trim())) return { op: null, error: 'Account must be a 0x…40-hex address.' };
      const roles = NEXTBLOCK_ADDRESSES.protocolRoles as `0x${string}`;
      const target = account.trim() as `0x${string}`;
      return {
        op: kind === 'grant' ? buildGrantRoleOperation(roles, role, target) : buildRevokeRoleOperation(roles, role, target),
        error: null,
      };
    } catch (e) {
      return { op: null, error: e instanceof Error ? e.message : 'encoding failed' };
    }
  }, [kind, role, account, rawLabel, rawTarget, rawData]);

  const delaySeconds = useMemo(() => {
    const h = Number(delayHours);
    return Number.isFinite(h) && h >= 1 ? BigInt(Math.round(h * 3600)) : null;
  }, [delayHours]);

  const batches = useMemo(() => {
    if (!op || delaySeconds == null) return null;
    return buildOperationBatches(
      op,
      NEXTBLOCK_ADDRESSES.protocolTimelock as `0x${string}`,
      NEXTBLOCK_CHAIN_ID,
      delaySeconds,
      Date.now(),
    );
  }, [op, delaySeconds]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8', padding: '40px 32px' }}>
      <div className="mx-auto" style={{ maxWidth: 720 }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Governance console</p>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 400, color: '#0F1218', marginBottom: 8 }}>
          Safe → timelock execution
        </h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#6B7280', marginBottom: 28, lineHeight: 1.6 }}>
          Owner-gated actions run through the timelock: <strong>schedule</strong> from the Safe now,
          wait the delay, then <strong>execute</strong>. This console encodes both steps as
          Transaction-Builder batches — upload them in the{' '}
          <a href={SAFE_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#1B3A6B', fontWeight: 600 }}>
            Safe app
          </a>. It cannot execute anything by itself: only timelock proposers can schedule.
        </p>

        <div className="card-institutional" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle} htmlFor="gov-kind">Operation</label>
              <select id="gov-kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as OpKind)}>
                <option value="grant">Grant protocol role</option>
                <option value="revoke">Revoke protocol role</option>
                <option value="raw">Raw owner-gated call</option>
              </select>
            </div>
            <div>
              <label style={labelStyle} htmlFor="gov-delay">Delay (hours, ≥ timelock minimum)</label>
              <input id="gov-delay" style={inputStyle} type="number" min={1} step={1} value={delayHours} onChange={(e) => setDelayHours(e.target.value)} />
            </div>
          </div>

          {kind !== 'raw' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle} htmlFor="gov-role">Role</label>
                <select id="gov-role" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value as ProtocolRoleName)}>
                  {PROTOCOL_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="gov-account">Account</label>
                <input id="gov-account" style={inputStyle} placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle} htmlFor="gov-label">Label (drives the deterministic salt)</label>
                <input id="gov-label" style={inputStyle} placeholder="e.g. set-deposit-cap-vault-A" value={rawLabel} onChange={(e) => setRawLabel(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle} htmlFor="gov-target">Target contract</label>
                  <input id="gov-target" style={inputStyle} placeholder="0x…" value={rawTarget} onChange={(e) => setRawTarget(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="gov-data">Calldata</label>
                  <input id="gov-data" style={inputStyle} placeholder="0x… (selector + args)" value={rawData} onChange={(e) => setRawData(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {error && (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: '#991B1B', margin: 0 }}>{error}</p>
          )}

          {batches && (
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#6B7280', margin: 0, wordBreak: 'break-all' }}>
                <strong>Operation id:</strong> {batches.id}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => downloadJson('timelock-schedule.json', batches.schedule)}
                  style={{ padding: '10px 22px', background: '#1B3A6B', color: '#FFF', borderRadius: 50, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  Download schedule batch
                </button>
                <button
                  type="button"
                  onClick={() => downloadJson('timelock-execute.json', batches.execute)}
                  style={{ padding: '10px 22px', background: 'rgba(27,58,107,0.08)', color: '#1B3A6B', borderRadius: 50, fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, border: '1px solid rgba(27,58,107,0.25)', cursor: 'pointer' }}
                >
                  Download execute batch
                </button>
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: '#9A9A9A', margin: 0, lineHeight: 1.6 }}>
                1. Upload <em>schedule</em> in the Safe Transaction Builder and collect signatures. 2. After the
                delay matures, upload <em>execute</em>. Track readiness with the operation id on the timelock
                (`isOperationReady`).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
