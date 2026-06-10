'use client';
import { VaultRow } from './VaultRow';

interface VaultTableProps {
  vaultAddresses: readonly `0x${string}`[];
}

export function VaultTable({ vaultAddresses }: VaultTableProps) {
  return (
    <div
      className="card-institutional overflow-hidden"
      style={{ borderRadius: '12px', overflow: 'hidden' }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              { label: 'Target APY', align: 'right' },
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
            <VaultRow key={address} vaultAddress={address} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
