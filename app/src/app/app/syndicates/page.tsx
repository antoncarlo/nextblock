'use client';
import Link from 'next/link';
import { Award, ChevronRight, Lock } from 'lucide-react';
import { useVaultAddresses } from '@/hooks/useVaultData';
import {
  useLensProtocolStatus,
  useLensVaultDashboards,
  LensDataStatus,
} from '@/hooks/useNextBlockLens';
import { DataSourceBadge } from '@/components/shared/DataSourceBadge';
import { useOfferingTerms } from '@/hooks/useOfferingTerms';
import { formatUSDC } from '@/lib/formatting';

export default function CuratorsPage() {
  // Canonical protocol figures: factory enumeration + NextBlockLens dashboards.
  const { data: protocolStatus, lensDeployed } = useLensProtocolStatus();
  const { data: vaultAddresses } = useVaultAddresses();
  const { terms } = useOfferingTerms();
  const { data: dashReads } = useLensVaultDashboards(vaultAddresses);
  const onchainVaults = (dashReads ?? [])
    .map(r => (r.status === 'success' ? r.result : undefined))
    .filter((d): d is NonNullable<typeof d> => d !== undefined && d.status === LensDataStatus.AVAILABLE);
  const lensAvailable = lensDeployed && protocolStatus !== undefined;
  const totalTvl = onchainVaults.reduce((s, d) => s + d.totalAssets, 0n);

  return (
    <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>

      {/* ── Hero banner ── */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 60%, #0A1628 100%)', position: 'relative', overflow: 'hidden', padding: '64px 40px 56px' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'url(/assets/ships-illustration.jpg)', backgroundSize:'cover', backgroundPosition:'center 30%', opacity:0.08 }} />
        <div style={{ position:'relative', maxWidth:'1200px', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'24px' }}>
            <Link href="/app" style={{ color:'rgba(255,255,255,0.5)', fontSize:'13px', textDecoration:'none' }}>Vaults</Link>
            <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
            <span style={{ color:'rgba(255,255,255,0.9)', fontSize:'13px' }}>Syndicates</span>
          </div>
          <h1 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'42px', fontWeight:700, color:'#FFFFFF', margin:'0 0 12px', letterSpacing:'-0.5px' }}>
            Syndicates
          </h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:'16px', margin:'0 0 8px', maxWidth:'560px' }}>
            On-chain authorized Syndicates: the entities that evaluate ceded
            reinsurance portfolios, approve risk terms and manage vault strategies.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:'48px' }}>
            {[
              { label: 'On-Chain Vaults', value: lensAvailable ? protocolStatus.vaultCount.toString() : '--' },
              { label: 'Portfolios', value: lensAvailable ? protocolStatus.portfolioCount.toString() : '--' },
              { label: 'Total TVL', value: onchainVaults.length > 0 ? `${formatUSDC(totalTvl)} USDC` : '--' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'28px', fontWeight:700, color:'#FFFFFF' }}>{s.value}</div>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', marginTop:'2px', letterSpacing:'0.08em', textTransform:'uppercase' }}>{s.label}</div>
              </div>
            ))}
            <DataSourceBadge source={lensAvailable ? 'onchain' : 'unavailable'} />
          </div>
        </div>
      </div>

      {/* ── KYC notice ── */}
      <div style={{ backgroundColor:'#EFF6FF', borderBottom:'1px solid #BFDBFE', padding:'14px 40px' }}>
        <div style={{ maxWidth:'1200px', margin:'0 auto', display:'flex', alignItems:'center', gap:'10px' }}>
          <Lock size={14} color="#1D4ED8" />
          <span style={{ fontSize:'13px', color:'#1D4ED8' }}>
            <strong>Syndicate access is restricted.</strong> Only KYC-verified entities approved by NextBlock may deploy Syndicates.{' '}
            <Link href="/app/apply" style={{ color:'#1D4ED8', textDecoration:'underline' }}>Apply to become a Syndicate →</Link>{' · '}<Link href="/app/syndicates/dashboard" style={{ color:'#1D4ED8', textDecoration:'underline', fontWeight:600 }}>Syndicate Dashboard →</Link>
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'48px 40px' }}>

        {/* On-chain syndicate vaults — canonical state from NextBlockLens */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'24px' }}>
          <h2 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'22px', fontWeight:600, color:'#1B3A6B', margin:0 }}>On-Chain Syndicate Vaults</h2>
          <DataSourceBadge source={onchainVaults.length > 0 ? 'onchain' : 'unavailable'} />
        </div>
        {onchainVaults.length > 0 ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))', gap:'16px', marginBottom:'48px' }}>
            {onchainVaults.map(d => (
              <Link key={d.vault} href={`/app/vault/${d.vault}`} style={{ textDecoration:'none' }}>
                <div style={{ backgroundColor:'#FFFFFF', border:'1px solid #E8E4DC', borderRadius:'12px', padding:'22px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                    <h3 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'18px', fontWeight:700, color:'#1B3A6B', margin:0 }}>{d.name}</h3>
                    <ChevronRight size={16} color="#9CA3AF" />
                  </div>
                  <div style={{ fontSize:'11px', color:'#8A8A8A', marginBottom:'14px' }}>
                    Manager: {terms.get(d.vault.toLowerCase())?.managerName ? `${terms.get(d.vault.toLowerCase())?.managerName} · ` : ''}<code>{d.manager.slice(0, 6)}...{d.manager.slice(-4)}</code>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:'12px', backgroundColor:'#FAFAF8', borderRadius:'8px', padding:'14px' }}>
                    {[
                      { label: 'TVL', value: `${formatUSDC(d.totalAssets)}` },
                      { label: 'UPR', value: `${formatUSDC(d.unearnedPremiums)}` },
                      { label: 'Buffer', value: `${formatUSDC(d.availableBuffer)}` },
                    ].map(m => (
                      <div key={m.label} style={{ textAlign:'center' }}>
                        <div style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'16px', fontWeight:700, color:'#1B3A6B' }}>{m.value}</div>
                        <div style={{ fontSize:'11px', color:'#8A8A8A', letterSpacing:'0.06em', textTransform:'uppercase' }}>{m.label} USDC</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'48px' }}>
            On-chain vault state unavailable on this chain.
          </p>
        )}

        {/* CTA */}
        <div style={{ background:'linear-gradient(135deg, #1B3A6B 0%, #0F2447 100%)', borderRadius:'16px', padding:'48px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'32px' }}>
          <div>
            <div style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'28px', fontWeight:700, color:'#FFFFFF', marginBottom:'10px' }}>Deploy Your Insurance Vault</div>
            <p style={{ color:'rgba(255,255,255,0.65)', fontSize:'15px', maxWidth:'480px', margin:0 }}>
              Are you a licensed reinsurer, insurer, or asset manager? Complete KYC onboarding and deploy your own ERC-4626 vault on NextBlock.
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px', alignItems:'flex-end' }}>
            <Link href="/app/apply" style={{ display:'inline-flex', alignItems:'center', gap:'8px', backgroundColor:'#FFFFFF', color:'#1B3A6B', padding:'14px 28px', borderRadius:'8px', fontSize:'14px', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
              <Award size={16} />Apply as Syndicate
            </Link>
            <Link href="/app/syndicates/dashboard" style={{ display:'inline-flex', alignItems:'center', gap:'8px', backgroundColor:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.9)', padding:'12px 24px', borderRadius:'8px', fontSize:'13px', fontWeight:500, textDecoration:'none', whiteSpace:'nowrap', border:'1px solid rgba(255,255,255,0.25)' }}>
              Syndicate Dashboard →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
