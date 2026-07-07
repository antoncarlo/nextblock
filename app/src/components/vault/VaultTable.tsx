'use client';
import { VaultRow } from './VaultRow';
import { useOfferingTerms } from '@/hooks/useOfferingTerms';

interface VaultTableProps {
  vaultAddresses: readonly `0x${string}`[];
}

export function VaultTable({ vaultAddresses }: VaultTableProps) {
  // Curator-supplied offering terms override the illustrative defaults
  // per-row; one fetch for the whole table.
  const { terms } = useOfferingTerms();
  return (
    <div
      className="card-institutional overflow-x-auto"
      style={{ borderRadius: '12px', WebkitOverflowScrolling: 'touch' }}
    >
      {/* min-width keeps the row layout intact on phones: the card scrolls
          horizontally instead of clipping columns. */}
      <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              borderBottom: '1px solid rgba(0,0,0,0.06)',
              background: '#FAFAF8',
            }}
          >
            {[
              { label: 'Vault', align: 'left' },
              { label: 'TVL', align: 'left' },
              { label: 'Syndicate Manager', align: 'left' },
              { label: 'Exposure', align: 'left' },
              { label: 'Policies', align: 'center' },
              { label: 'Illustrative APY', align: 'right' },
            ].map((col) => (
              <th
                key={col.label}
                style={{
                  padding: '12px 24px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#9A9A9A',
                  textAlign: col.align as 'left' | 'center' | 'right',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vaultAddresses.map((address) => (
            <VaultRow
              key={address}
              vaultAddress={address}
              offeringTerms={terms.get(address.toLowerCase())}
            />
          ))}
        </tbody>
      </table>
      {/* Compliance: target figures must never read as promised yield. */}
      <p
        style={{
          padding: '10px 24px 12px',
          margin: 0,
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          color: '#9A9A9A',
          borderTop: '1px solid rgba(0,0,0,0.04)',
        }}
      >
        Target APY figures are illustrative underwriting targets set at vault
        creation — not measured performance and not a promise of yield. Returns
        depend on premiums earned and claims incurred; capital is at risk.
      </p>
    </div>
  );
}
