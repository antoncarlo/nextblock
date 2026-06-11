'use client';

/**
 * Explicit data-source labelling (Phase 9 requirement): every figure shown in
 * the institutional dashboards must declare where it comes from. No data may
 * be presented as real when it is mocked or unavailable.
 */
export type DataSource = 'onchain' | 'backend' | 'mock-oracle' | 'backend-mock' | 'demo-legacy' | 'unavailable';

const CONFIG: Record<DataSource, { label: string; bg: string; color: string; border: string }> = {
  'onchain':      { label: 'On-chain',      bg: 'rgba(22,101,52,0.08)',  color: '#166534', border: 'rgba(22,101,52,0.25)' },
  // Real instructional/off-chain records (e.g. KYB pipeline): not mocked,
  // but explicitly NOT on-chain state either.
  'backend':      { label: 'Backend',       bg: 'rgba(13,116,144,0.08)', color: '#0E7490', border: 'rgba(13,116,144,0.25)' },
  'mock-oracle':  { label: 'Mock oracle',   bg: 'rgba(146,64,14,0.08)',  color: '#92400E', border: 'rgba(146,64,14,0.25)' },
  'backend-mock': { label: 'Backend mock',  bg: 'rgba(27,58,107,0.08)',  color: '#1B3A6B', border: 'rgba(27,58,107,0.25)' },
  'demo-legacy':  { label: 'Legacy demo',   bg: 'rgba(109,40,217,0.08)', color: '#6D28D9', border: 'rgba(109,40,217,0.25)' },
  'unavailable':  { label: 'Unavailable',   bg: 'rgba(127,29,29,0.08)',  color: '#7F1D1D', border: 'rgba(127,29,29,0.25)' },
};

export function DataSourceBadge({ source, title }: { source: DataSource; title?: string }) {
  const cfg = CONFIG[source];
  return (
    <span
      title={title ?? `Data source: ${cfg.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        borderRadius: 9999,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

/** Full-width banner for sections whose backing contract is not deployed. */
export function UnavailableNotice({ what }: { what: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(127,29,29,0.06)',
        border: '1px solid rgba(127,29,29,0.2)',
        color: '#7F1D1D',
        fontSize: 13,
      }}
    >
      <strong>Unavailable.</strong> {what} is not deployed on this network. No
      substitute data is shown by design — connect to a network where the
      institutional protocol stack is deployed.
    </div>
  );
}
