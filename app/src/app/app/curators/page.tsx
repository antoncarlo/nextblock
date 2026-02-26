'use client';
import Link from 'next/link';
import { Shield, TrendingUp, Building2, Globe, Award, ChevronRight, Lock } from 'lucide-react';

const CURATORS = [
  {
    id: 'nextblock-core',
    name: 'NextBlock Core Team',
    type: 'Protocol',
    jurisdiction: 'Saint Kitts & Nevis',
    description:
      'The founding team of the NextBlock protocol. Manages the flagship Balanced Core vault with full-spectrum diversification across all three verification paths: permissionless, oracle-verified, and admin-settled.',
    aum: '$29K',
    vaultCount: 1,
    avgApy: '8–12%',
    riskProfile: 'Moderate',
    riskColor: '#B45309',
    verificationTypes: ['Permissionless', 'Oracle', 'Admin'],
    vaults: [{ name: 'Balanced Core', tvl: '$29K', apy: '8–12%', policies: 5 }],
    kyc: true,
    featured: true,
    since: '2024',
    badge: 'Founding Curator',
  },
  {
    id: 'klapton-re',
    name: 'Klapton Re Partners',
    type: 'Reinsurer',
    jurisdiction: 'Saint Kitts & Nevis',
    description:
      'Licensed reinsurer and strategic partner of NextBlock. Manages both the Conservative Yield vault (low-volatility off-chain reinsurance) and the flagship Klapton RE Surety vault — the largest vault on the protocol by AUM.',
    aum: '$537K',
    vaultCount: 2,
    avgApy: '5–14%',
    riskProfile: 'Lower',
    riskColor: '#047857',
    verificationTypes: ['Admin', 'Oracle'],
    vaults: [
      { name: 'Conservative Yield', tvl: '$32K', apy: '5–8%', policies: 4 },
      { name: 'Klapton RE Surety', tvl: '$505K', apy: '8–14%', policies: 31 },
    ],
    kyc: true,
    featured: true,
    since: '2024',
    badge: 'Strategic Partner',
  },
  {
    id: 'alphare-capital',
    name: 'AlphaRe Capital',
    type: 'Reinsurer',
    jurisdiction: 'Bermuda',
    description:
      'Specialist in on-chain parametric and crypto-native risk. Operates the Digital Asset Shield vault with automated claim settlement via smart contract triggers only — no manual adjudication.',
    aum: '$52K',
    vaultCount: 1,
    avgApy: '10–14%',
    riskProfile: 'Higher',
    riskColor: '#C2410C',
    verificationTypes: ['Permissionless'],
    vaults: [{ name: 'Digital Asset Shield', tvl: '$52K', apy: '10–14%', policies: 4 }],
    kyc: true,
    featured: true,
    since: '2024',
    badge: 'Verified Reinsurer',
  },
  {
    id: 'alpine-re',
    name: 'Alpine Re',
    type: 'Reinsurer',
    jurisdiction: 'Switzerland',
    description:
      'Catastrophe-focused reinsurer with deep expertise in nat-cat modelling. The Catastrophe & Specialty vault targets the highest APY tier on the protocol with specialty lines diversification.',
    aum: '$53K',
    vaultCount: 1,
    avgApy: '14–18%',
    riskProfile: 'High',
    riskColor: '#B91C1C',
    verificationTypes: ['Oracle', 'Admin'],
    vaults: [{ name: 'Catastrophe & Specialty', tvl: '$53K', apy: '14–18%', policies: 4 }],
    kyc: true,
    featured: false,
    since: '2024',
    badge: 'Verified Reinsurer',
  },
  {
    id: 'stormguard-capital',
    name: 'StormGuard Capital',
    type: 'Insurer',
    jurisdiction: 'Cayman Islands',
    description:
      'Parametric insurance specialist. The Parametric Shield vault settles claims automatically via oracle-verified triggers — no manual adjudication required.',
    aum: '$17K',
    vaultCount: 1,
    avgApy: '9–13%',
    riskProfile: 'Moderate',
    riskColor: '#B45309',
    verificationTypes: ['Oracle'],
    vaults: [{ name: 'Parametric Shield', tvl: '$17K', apy: '9–13%', policies: 4 }],
    kyc: true,
    featured: false,
    since: '2024',
    badge: 'Verified Insurer',
  },
  {
    id: 'bondsecure-capital',
    name: 'BondSecure Capital',
    type: 'Asset Manager',
    jurisdiction: 'Luxembourg',
    description:
      'Traditional lines specialist managing established commercial and liability reinsurance portfolios. Conservative, low-volatility strategy designed for institutional allocators.',
    aum: '$21K',
    vaultCount: 1,
    avgApy: '6–9%',
    riskProfile: 'Lower',
    riskColor: '#047857',
    verificationTypes: ['Admin'],
    vaults: [{ name: 'Traditional Lines', tvl: '$21K', apy: '6–9%', policies: 3 }],
    kyc: true,
    featured: false,
    since: '2024',
    badge: 'Verified Asset Manager',
  },
  {
    id: 'cyberguard-partners',
    name: 'CyberGuard Partners',
    type: 'Insurer',
    jurisdiction: 'Singapore',
    description:
      'Digital asset and technology risk specialist. Combines cyber insurance with property diversification in the Technology & Specialty vault.',
    aum: '$16K',
    vaultCount: 1,
    avgApy: '8–11%',
    riskProfile: 'Moderate',
    riskColor: '#B45309',
    verificationTypes: ['Oracle', 'Permissionless'],
    vaults: [{ name: 'Technology & Specialty', tvl: '$16K', apy: '8–11%', policies: 3 }],
    kyc: true,
    featured: false,
    since: '2024',
    badge: 'Verified Insurer',
  },
  {
    id: 'meridian-risk',
    name: 'Meridian Risk Mgmt',
    type: 'Asset Manager',
    jurisdiction: 'Cayman Islands',
    description:
      'Maximum diversification across all insurance categories. The Multi-Line Diversified vault is designed for allocators seeking broad exposure to the insurance risk premium.',
    aum: '$29K',
    vaultCount: 1,
    avgApy: '9–13%',
    riskProfile: 'Moderate',
    riskColor: '#B45309',
    verificationTypes: ['Permissionless', 'Oracle', 'Admin'],
    vaults: [{ name: 'Multi-Line Diversified', tvl: '$29K', apy: '9–13%', policies: 6 }],
    kyc: true,
    featured: false,
    since: '2024',
    badge: 'Verified Asset Manager',
  },
];

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    Protocol:       { bg: '#EFF6FF', color: '#1D4ED8', icon: <Shield size={11} /> },
    Reinsurer:      { bg: '#FFF7ED', color: '#C2410C', icon: <Building2 size={11} /> },
    Insurer:        { bg: '#F0FDF4', color: '#166534', icon: <Shield size={11} /> },
    'Asset Manager':{ bg: '#FAF5FF', color: '#7E22CE', icon: <TrendingUp size={11} /> },
  };
  const s = map[type] ?? map['Protocol'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', backgroundColor:s.bg, color:s.color, fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'4px', letterSpacing:'0.06em', textTransform:'uppercase' }}>
      {s.icon}{type}
    </span>
  );
}

export default function CuratorsPage() {
  const featured = CURATORS.filter(c => c.featured);
  const rest     = CURATORS.filter(c => !c.featured);
  const totalAum = '$814K';

  return (
    <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>

      {/* ── Hero banner ── */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 60%, #0A1628 100%)', position: 'relative', overflow: 'hidden', padding: '64px 40px 56px' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'url(/assets/ships-illustration.jpg)', backgroundSize:'cover', backgroundPosition:'center 30%', opacity:0.08 }} />
        <div style={{ position:'relative', maxWidth:'1200px', margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'24px' }}>
            <Link href="/app" style={{ color:'rgba(255,255,255,0.5)', fontSize:'13px', textDecoration:'none' }}>Vaults</Link>
            <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
            <span style={{ color:'rgba(255,255,255,0.9)', fontSize:'13px' }}>Curators</span>
          </div>
          <h1 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'42px', fontWeight:700, color:'#FFFFFF', margin:'0 0 12px', letterSpacing:'-0.5px' }}>
            Vault Curators
          </h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:'16px', margin:'0 0 40px', maxWidth:'560px' }}>
            KYC-verified reinsurers, insurers, and asset managers who deploy and manage insurance vaults on the NextBlock protocol.
          </p>
          <div style={{ display:'flex', gap:'48px' }}>
            {[{ label:'Active Curators', value: CURATORS.length }, { label:'Total Vaults', value: CURATORS.reduce((s,c)=>s+c.vaultCount,0) }, { label:'Total AUM', value: totalAum }].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'28px', fontWeight:700, color:'#FFFFFF' }}>{s.value}</div>
                <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.5)', marginTop:'2px', letterSpacing:'0.08em', textTransform:'uppercase' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KYC notice ── */}
      <div style={{ backgroundColor:'#EFF6FF', borderBottom:'1px solid #BFDBFE', padding:'14px 40px' }}>
        <div style={{ maxWidth:'1200px', margin:'0 auto', display:'flex', alignItems:'center', gap:'10px' }}>
          <Lock size={14} color="#1D4ED8" />
          <span style={{ fontSize:'13px', color:'#1D4ED8' }}>
            <strong>Curator access is restricted.</strong> Only KYC-verified entities approved by NextBlock may deploy vaults.{' '}
            <Link href="/app/apply" style={{ color:'#1D4ED8', textDecoration:'underline' }}>Apply to become a curator →</Link>{' · '}<Link href="/app/curators/dashboard" style={{ color:'#1D4ED8', textDecoration:'underline', fontWeight:600 }}>Curator Dashboard →</Link>
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'48px 40px' }}>

        {/* Featured */}
        <h2 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'22px', fontWeight:600, color:'#1B3A6B', marginBottom:'24px' }}>Featured Curators</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(520px, 1fr))', gap:'20px', marginBottom:'48px' }}>
          {featured.map(c => <CuratorCard key={c.id} curator={c} featured />)}
        </div>

        {/* All */}
        <h2 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'22px', fontWeight:600, color:'#1B3A6B', marginBottom:'24px' }}>All Curators</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))', gap:'16px', marginBottom:'64px' }}>
          {rest.map(c => <CuratorCard key={c.id} curator={c} featured={false} />)}
        </div>

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
              <Award size={16} />Apply as Curator
            </Link>
            <Link href="/app/curators/dashboard" style={{ display:'inline-flex', alignItems:'center', gap:'8px', backgroundColor:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.9)', padding:'12px 24px', borderRadius:'8px', fontSize:'13px', fontWeight:500, textDecoration:'none', whiteSpace:'nowrap', border:'1px solid rgba(255,255,255,0.25)' }}>
              Curator Dashboard →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function CuratorCard({ curator, featured }: { curator: typeof CURATORS[0]; featured: boolean }) {
  return (
    <div
      style={{ backgroundColor:'#FFFFFF', border:'1px solid #E8E4DC', borderRadius:'12px', padding: featured ? '28px' : '22px', transition:'box-shadow 0.2s, border-color 0.2s', cursor:'default' }}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='0 8px 32px rgba(27,58,107,0.12)'; d.style.borderColor='#1B3A6B'; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.boxShadow='none'; d.style.borderColor='#E8E4DC'; }}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
            <TypeBadge type={curator.type} />
            <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', backgroundColor:'#F0FDF4', color:'#166534', fontSize:'11px', fontWeight:600, padding:'3px 8px', borderRadius:'4px' }}>
              ✓ KYC Verified
            </span>
          </div>
          <h3 style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize: featured ? '22px' : '18px', fontWeight:700, color:'#1B3A6B', margin:'4px 0 2px' }}>{curator.name}</h3>
          <div style={{ display:'flex', alignItems:'center', gap:'4px', color:'#8A8A8A', fontSize:'12px' }}>
            <Globe size={11} />{curator.jurisdiction} · Since {curator.since}
          </div>
        </div>
        <span style={{ backgroundColor:'#F5F0E8', color:'#6B5B3E', fontSize:'11px', fontWeight:600, padding:'4px 10px', borderRadius:'20px', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>
          {curator.badge}
        </span>
      </div>

      {/* Description */}
      <p style={{ fontSize:'13px', color:'#5A5A5A', lineHeight:'1.6', marginBottom:'20px' }}>{curator.description}</p>

      {/* Metrics */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', backgroundColor:'#FAFAF8', borderRadius:'8px', padding:'14px', marginBottom:'20px' }}>
        {[{ label:'AUM', value:curator.aum }, { label:'Avg APY', value:curator.avgApy }, { label:'Vaults', value:curator.vaultCount }].map(m => (
          <div key={m.label} style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'"Playfair Display", Georgia, serif', fontSize:'18px', fontWeight:700, color:'#1B3A6B' }}>{m.value}</div>
            <div style={{ fontSize:'11px', color:'#8A8A8A', letterSpacing:'0.06em', textTransform:'uppercase' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Risk + verification */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <span style={{ fontSize:'11px', color:'#8A8A8A', textTransform:'uppercase', letterSpacing:'0.06em' }}>Risk:</span>
          <span style={{ fontSize:'12px', fontWeight:600, color: curator.riskColor }}>{curator.riskProfile}</span>
        </div>
        <div style={{ display:'flex', gap:'4px' }}>
          {curator.verificationTypes.map(v => (
            <span key={v} style={{ fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'4px', backgroundColor:'#F0F4FF', color:'#3B5BDB', letterSpacing:'0.04em' }}>{v}</span>
          ))}
        </div>
      </div>

      {/* Vault list */}
      <div style={{ borderTop:'1px solid #F0EDE8', paddingTop:'16px' }}>
        <div style={{ fontSize:'11px', color:'#8A8A8A', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'10px' }}>Managed Vaults</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {curator.vaults.map(v => (
            <div key={v.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', backgroundColor:'#FAFAF8', borderRadius:'6px', border:'1px solid #F0EDE8' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:600, color:'#1B3A6B', fontFamily:'"Playfair Display", Georgia, serif' }}>{v.name}</div>
                <div style={{ fontSize:'11px', color:'#8A8A8A' }}>{v.policies} policies · TVL {v.tvl}</div>
              </div>
              <span style={{ fontSize:'12px', fontWeight:700, color:'#047857', backgroundColor:'#F0FDF4', padding:'3px 8px', borderRadius:'4px' }}>{v.apy}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
