'use client';

import { usePassiveBreach } from '@/hooks/usePassiveBreach';
import { formatUSDC } from '@/lib/formatting';

/**
 * Concentration state of a vault's allocated book.
 *
 * Shows a passive breach for what it is rather than as an error. The bucket is
 * over its threshold because the vault's investable base fell when LPs
 * redeemed, not because anyone allocated too much — so the wording avoids
 * language that implies a mistake was made or that action is overdue.
 *
 * Nothing here offers a button. Adding to a breaching bucket is already refused
 * on-chain, and unwinding is deliberately not offered: pulling capital out of a
 * live treaty removes the collateral behind cover already written. The position
 * is corrected by writing no more and letting the tenor run off, which is a
 * decision measured in months and does not belong behind a click.
 */
export function ConcentrationPanel({ vaultAddress }: { vaultAddress?: `0x${string}` }) {
  const { breaches, checked, isLoading, isUnavailable } = usePassiveBreach(vaultAddress);

  if (isLoading) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Concentration</h3>
        <p style={mutedStyle}>Reading the allocated book…</p>
      </div>
    );
  }

  // Stated rather than hidden. A failed read and a clean book are the same
  // shape to a component that only receives a list, and reporting "no issues"
  // on the strength of a failed call is the more expensive mistake.
  if (isUnavailable) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Concentration</h3>
        <p style={mutedStyle}>
          Concentration could not be read. This is a connection problem, not a statement about the book.
        </p>
      </div>
    );
  }

  if (checked.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Concentration</h3>
        <p style={mutedStyle}>No capital is allocated to a portfolio yet.</p>
      </div>
    );
  }

  if (breaches.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Concentration</h3>
        <p style={{ ...mutedStyle, color: '#1B7A4B' }}>
          All {checked.length} allocated {checked.length === 1 ? 'portfolio is' : 'portfolios are'} within their
          concentration thresholds.
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, borderColor: '#C9A227' }}>
      <h3 style={titleStyle}>Concentration</h3>
      <p style={{ ...mutedStyle, marginBottom: '12px' }}>
        {breaches.length} {breaches.length === 1 ? 'bucket sits' : 'buckets sit'} above the monitored threshold. The
        threshold is a share of the vault&apos;s investable base, and that base falls when investors redeem — so a
        position can pass this line without anything having been allocated to it.
      </p>
      <p style={{ ...mutedStyle, marginBottom: '16px' }}>
        No further capital can be written to these buckets. Existing cover stays in place and runs to expiry; unwinding
        it would withdraw the collateral behind cover already sold.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Portfolio</th>
              <th style={thStyle}>Bucket</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Above threshold by</th>
            </tr>
          </thead>
          <tbody>
            {breaches.map((b) => (
              <tr key={b.portfolioId.toString()}>
                <td style={tdStyle}>#{b.portfolioId.toString()}</td>
                <td style={tdStyle}>
                  {b.portfolioBreached && b.cedantBreached
                    ? 'Portfolio and cedant'
                    : b.portfolioBreached
                      ? 'Portfolio'
                      : 'Cedant'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatUSDC(b.portfolioExcess > b.cedantExcess ? b.portfolioExcess : b.cedantExcess)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '24px',
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: '18px',
  color: '#1B3A6B',
  marginBottom: '8px',
};

const mutedStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#4B5563',
  lineHeight: 1.6,
  margin: 0,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB',
  color: '#6B7280',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #F3F4F6',
  color: '#111827',
};
