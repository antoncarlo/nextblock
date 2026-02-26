'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import {
  ChevronRight, Plus, Settings, TrendingUp, Shield, AlertTriangle,
  BarChart2, Users, FileText, Zap, Lock, CheckCircle2, Clock,
  ArrowUpRight, Edit3, Trash2, Eye, PauseCircle, PlayCircle,
} from 'lucide-react';
import { CURATOR_WHITELIST, INSURANCE_COMPANY_WHITELIST } from '@/app/app/apply/page';

// Strategy templates available to syndicates
const STRATEGY_TEMPLATES = [
  {
    id: 'conservative-reinsurance',
    name: 'Conservative Reinsurance',
    category: 'Low Risk',
    categoryColor: '#047857',
    description: 'Off-chain reinsurance portfolio with admin-verified claims. Ideal for traditional lines: property, liability, marine. High buffer ratio (25–35%), low management fee.',
    bufferRange: '25–35%',
    feeRange: '0.3–0.8%',
    apyRange: '4–8%',
    verificationTypes: ['Admin'],
    suitableFor: ['Licensed Reinsurers', 'Traditional Insurers'],
    icon: Shield,
    color: '#047857',
    bg: 'rgba(4,120,87,0.06)',
  },
  {
    id: 'balanced-diversified',
    name: 'Balanced Diversified',
    category: 'Moderate Risk',
    categoryColor: '#B45309',
    description: 'Full-spectrum diversification across all three verification paths. Mix of on-chain parametric, oracle-verified and admin-settled policies. Standard buffer (15–25%).',
    bufferRange: '15–25%',
    feeRange: '0.8–1.5%',
    apyRange: '8–13%',
    verificationTypes: ['Permissionless', 'Oracle', 'Admin'],
    suitableFor: ['Asset Managers', 'Multi-line Insurers'],
    icon: BarChart2,
    color: '#B45309',
    bg: 'rgba(180,83,9,0.06)',
  },
  {
    id: 'parametric-oracle',
    name: 'Parametric Oracle',
    category: 'Moderate Risk',
    categoryColor: '#B45309',
    description: 'Oracle-verified parametric insurance only. Automated settlement via Chainlink or custom data feeds. Weather, flight delay, commodity price triggers.',
    bufferRange: '15–20%',
    feeRange: '1.0–1.8%',
    apyRange: '9–13%',
    verificationTypes: ['Oracle'],
    suitableFor: ['Parametric Specialists', 'InsurTech'],
    icon: Zap,
    color: '#1D4ED8',
    bg: 'rgba(29,78,216,0.06)',
  },
  {
    id: 'crypto-native',
    name: 'Crypto-Native Shield',
    category: 'Higher Risk',
    categoryColor: '#C2410C',
    description: 'Permissionless on-chain claims only. Smart contract exploit coverage, protocol hack insurance, bridge failure protection. Fully automated settlement.',
    bufferRange: '10–15%',
    feeRange: '1.2–2.0%',
    apyRange: '10–14%',
    verificationTypes: ['Permissionless'],
    suitableFor: ['DeFi Specialists', 'Crypto-native Funds'],
    icon: Shield,
    color: '#7C3AED',
    bg: 'rgba(124,58,237,0.06)',
  },
  {
    id: 'catastrophe-specialty',
    name: 'Catastrophe & Specialty',
    category: 'High Risk',
    categoryColor: '#B91C1C',
    description: 'Catastrophe-focused with specialty lines. Hurricane, earthquake, flood parametric triggers combined with admin-verified specialty coverage. High APY potential.',
    bufferRange: '8–15%',
    feeRange: '1.5–2.5%',
    apyRange: '14–18%',
    verificationTypes: ['Oracle', 'Admin'],
    suitableFor: ['Cat Bond Specialists', 'Reinsurers'],
    icon: AlertTriangle,
    color: '#B91C1C',
    bg: 'rgba(185,28,28,0.06)',
  },
  {
    id: 'custom',
    name: 'Custom Strategy',
    category: 'Custom',
    categoryColor: '#1B3A6B',
    description: 'Design your own strategy from scratch. Full control over buffer ratio, management fee, verification paths, and policy allocation weights.',
    bufferRange: 'Custom',
    feeRange: 'Custom',
    apyRange: 'Custom',
    verificationTypes: ['Permissionless', 'Oracle', 'Admin'],
    suitableFor: ['All Syndicates'],
    icon: Settings,
    color: '#1B3A6B',
    bg: 'rgba(27,58,107,0.06)',
  },
];

// Mock active strategies for the syndicate manager
const ACTIVE_STRATEGIES = [
  {
    id: 'strat-001',
    name: 'Balanced Core',
    template: 'Balanced Diversified',
    status: 'active',
    tvl: '$29,420',
    apy: '9.2%',
    policies: 5,
    bufferBps: 2000,
    feeBps: 100,
    lastUpdated: '2025-01-15',
    vaultAddress: '0xF725B7E9176F1F2D0B9b3D0e3E5e1b1C5e2D3A4B',
  },
];

type TabId = 'overview' | 'strategies' | 'new-strategy' | 'policies' | 'performance';

export default function CuratorDashboardPage() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [strategyStep, setStrategyStep] = useState<1 | 2 | 3>(1);
  const [strategyForm, setStrategyForm] = useState({
    name: '',
    tokenSymbol: '',
    bufferBps: '2000',
    feeBps: '100',
    jurisdiction: '',
    description: '',
    verificationTypes: ['permissionless'],
  });

  const isSyndicateManager = isConnected && address
    ? CURATOR_WHITELIST.includes(address.toLowerCase()) || INSURANCE_COMPANY_WHITELIST.includes(address.toLowerCase())
    : false;

  // Not connected
  if (!isConnected) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '48px' }}>
          <Lock size={48} color="#1B3A6B" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', color: '#1B3A6B', marginBottom: '12px' }}>Connect Your Wallet</h2>
          <p style={{ fontSize: '14px', color: '#8A8A8A', lineHeight: '1.6' }}>Connect your wallet to access the syndicate dashboard.</p>
        </div>
      </div>
    );
  }

  // Not a syndicate manager
  if (!isSyndicateManager) {
    return (
      <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>
        <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 100%)', padding: '64px 40px 56px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '42px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 12px' }}>Syndicate Dashboard</h1>
          </div>
        </div>
        <div style={{ maxWidth: '640px', margin: '64px auto', padding: '0 40px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <Lock size={32} color="#C2410C" style={{ marginBottom: '16px' }} />
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', color: '#1B3A6B', marginBottom: '12px' }}>Syndicate Access Required</h2>
            <p style={{ fontSize: '14px', color: '#5A5A5A', lineHeight: '1.7', marginBottom: '24px' }}>
              This dashboard is reserved for KYC-verified syndicates. Apply to become a Syndicate Manager to access strategy creation and vault management tools.
            </p>
            <Link href="/app/apply" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '12px 28px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              Apply as Syndicate Manager
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'strategies', label: 'My Strategies', icon: TrendingUp },
    { id: 'new-strategy', label: '+ New Strategy', icon: Plus },
    { id: 'policies', label: 'Policy Pool', icon: FileText },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
  ];

  return (
    <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 100%)', padding: '56px 40px 48px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/assets/ships-illustration.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 30%', opacity: 0.07 }} />
        <div style={{ position: 'relative', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Link href="/app/syndicates" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textDecoration: 'none' }}>Syndicates</Link>
            <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>Dashboard</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '38px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>Syndicate Dashboard</h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', margin: 0 }}>
                {address?.slice(0, 6)}...{address?.slice(-4)} · Verified Syndicate Manager
              </p>
            </div>
            <div style={{ display: 'flex', gap: '24px' }}>
              {[
                { label: 'Total AUM', value: '$29,420' },
                { label: 'Active Vaults', value: '1' },
                { label: 'Avg APY', value: '9.2%' },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', fontFamily: '"Playfair Display", Georgia, serif' }}>{stat.value}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8E4DC' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px', display: 'flex', gap: '0' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '14px 20px', border: 'none', borderBottom: activeTab === tab.id ? '2px solid #1B3A6B' : '2px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? '#1B3A6B' : '#8A8A8A', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 40px' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
              {[
                { label: 'Total AUM', value: '$29,420', delta: '+12.4%', color: '#047857' },
                { label: 'Active Policies', value: '5', delta: 'in 1 vault', color: '#1B3A6B' },
                { label: 'Earned Fees (30d)', value: '$294', delta: '1.0% fee', color: '#B45309' },
                { label: 'Claims Settled', value: '2', delta: 'all time', color: '#1B3A6B' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '20px 24px' }}>
                  <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>{stat.label}</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#1B3A6B', fontFamily: '"Playfair Display", Georgia, serif', marginBottom: '4px' }}>{stat.value}</div>
                  <div style={{ fontSize: '12px', color: stat.color, fontWeight: 500 }}>{stat.delta}</div>
                </div>
              ))}
            </div>

            {/* Active vaults */}
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #E8E4DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1B3A6B', margin: 0 }}>Active Vaults</h3>
                <button onClick={() => setActiveTab('new-strategy')} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  <Plus size={13} /> New Strategy
                </button>
              </div>
              {ACTIVE_STRATEGIES.map(strat => (
                <div key={strat.id} style={{ padding: '20px 24px', borderBottom: '1px solid #F5F5F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(27,58,107,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BarChart2 size={18} color="#1B3A6B" />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B', fontFamily: '"Playfair Display", Georgia, serif' }}>{strat.name}</div>
                      <div style={{ fontSize: '12px', color: '#8A8A8A' }}>{strat.template} · {strat.policies} policies</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B' }}>{strat.tvl}</div>
                      <div style={{ fontSize: '11px', color: '#8A8A8A' }}>TVL</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#047857' }}>{strat.apy}</div>
                      <div style={{ fontSize: '11px', color: '#8A8A8A' }}>APY</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: '50px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(4,120,87,0.08)', color: '#047857', border: '1px solid rgba(4,120,87,0.2)' }}>
                      Active
                    </span>
                    <Link href={`/app/vault/${strat.vaultAddress}/manage`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1B3A6B', textDecoration: 'none', fontWeight: 500 }}>
                      Manage <ArrowUpRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { icon: Plus, title: 'Create New Strategy', desc: 'Deploy a new insurance vault with a custom or template-based strategy.', action: () => setActiveTab('new-strategy'), cta: 'Start' },
                { icon: FileText, title: 'Register Policy', desc: 'Add a new insurance policy to the PolicyRegistry and allocate it to a vault.', action: () => setActiveTab('policies'), cta: 'Register' },
                { icon: Users, title: 'View All Syndicates', desc: 'Browse the full list of verified syndicates and their vault strategies.', action: null, href: '/app/syndicates', cta: 'Browse' },
              ].map(item => (
                <div key={item.title} style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '24px' }}>
                  <item.icon size={20} color="#1B3A6B" style={{ marginBottom: '12px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B', marginBottom: '6px' }}>{item.title}</div>
                  <div style={{ fontSize: '12px', color: '#8A8A8A', lineHeight: '1.5', marginBottom: '16px' }}>{item.desc}</div>
                  {item.href ? (
                    <Link href={item.href} style={{ fontSize: '12px', fontWeight: 600, color: '#1B3A6B', textDecoration: 'none' }}>{item.cta} →</Link>
                  ) : (
                    <button onClick={item.action!} style={{ fontSize: '12px', fontWeight: 600, color: '#1B3A6B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{item.cta} →</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MY STRATEGIES TAB */}
        {activeTab === 'strategies' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', color: '#1B3A6B', margin: 0 }}>My Strategies</h2>
              <button onClick={() => setActiveTab('new-strategy')} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <Plus size={14} /> New Strategy
              </button>
            </div>
            {ACTIVE_STRATEGIES.map(strat => (
              <div key={strat.id} style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', color: '#1B3A6B', margin: 0 }}>{strat.name}</h3>
                      <span style={{ padding: '2px 8px', borderRadius: '50px', fontSize: '10px', fontWeight: 600, backgroundColor: 'rgba(4,120,87,0.08)', color: '#047857', border: '1px solid rgba(4,120,87,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#8A8A8A' }}>Template: {strat.template} · Last updated {strat.lastUpdated}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href={`/app/vault/${strat.vaultAddress}/manage`} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E8E4DC', backgroundColor: '#FAFAF8', fontSize: '12px', fontWeight: 500, color: '#1B3A6B', textDecoration: 'none' }}>
                      <Settings size={13} /> Manage
                    </Link>
                    <Link href={`/app/vault/${strat.vaultAddress}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #E8E4DC', backgroundColor: '#FAFAF8', fontSize: '12px', fontWeight: 500, color: '#1B3A6B', textDecoration: 'none' }}>
                      <Eye size={13} /> View
                    </Link>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                  {[
                    { label: 'TVL', value: strat.tvl },
                    { label: 'APY', value: strat.apy },
                    { label: 'Policies', value: strat.policies.toString() },
                    { label: 'Buffer', value: `${strat.bufferBps / 100}%` },
                    { label: 'Mgmt Fee', value: `${strat.feeBps / 100}%` },
                  ].map(m => (
                    <div key={m.label} style={{ backgroundColor: '#FAFAF8', borderRadius: '8px', padding: '12px 16px' }}>
                      <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>{m.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#1B3A6B', fontFamily: '"Playfair Display", Georgia, serif' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* NEW STRATEGY TAB */}
        {activeTab === 'new-strategy' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '28px', color: '#1B3A6B', margin: '0 0 8px' }}>Create New Strategy</h2>
              <p style={{ fontSize: '14px', color: '#8A8A8A', margin: 0 }}>Choose a strategy template or build a custom one. Each strategy deploys a new ERC-4626 vault via VaultFactory.</p>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '32px', backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', overflow: 'hidden' }}>
              {[
                { n: 1, label: 'Choose Template' },
                { n: 2, label: 'Configure Parameters' },
                { n: 3, label: 'Review & Deploy' },
              ].map((s, i) => (
                <div key={s.n} style={{ flex: 1, padding: '16px 20px', borderRight: i < 2 ? '1px solid #E8E4DC' : 'none', backgroundColor: strategyStep === s.n ? 'rgba(27,58,107,0.04)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: strategyStep > s.n ? '#047857' : strategyStep === s.n ? '#1B3A6B' : '#E8E4DC', color: strategyStep >= s.n ? '#FFFFFF' : '#8A8A8A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      {strategyStep > s.n ? '✓' : s.n}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: strategyStep === s.n ? 600 : 400, color: strategyStep === s.n ? '#1B3A6B' : '#8A8A8A' }}>{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* STEP 1: Choose Template */}
            {strategyStep === 1 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {STRATEGY_TEMPLATES.map(tmpl => {
                    const Icon = tmpl.icon;
                    const isSelected = selectedTemplate === tmpl.id;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => setSelectedTemplate(tmpl.id)}
                        style={{ textAlign: 'left', backgroundColor: isSelected ? 'rgba(27,58,107,0.04)' : '#FFFFFF', border: isSelected ? '2px solid #1B3A6B' : '1px solid #E8E4DC', borderRadius: '12px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: tmpl.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon size={20} color={tmpl.color} />
                          </div>
                          <span style={{ padding: '3px 8px', borderRadius: '50px', fontSize: '10px', fontWeight: 600, color: tmpl.categoryColor, backgroundColor: `${tmpl.categoryColor}14`, border: `1px solid ${tmpl.categoryColor}30`, letterSpacing: '0.04em' }}>
                            {tmpl.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1B3A6B', fontFamily: '"Playfair Display", Georgia, serif', marginBottom: '6px' }}>{tmpl.name}</div>
                        <div style={{ fontSize: '12px', color: '#5A5A5A', lineHeight: '1.5', marginBottom: '16px' }}>{tmpl.description}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                          {[
                            { label: 'Buffer', value: tmpl.bufferRange },
                            { label: 'Fee', value: tmpl.feeRange },
                            { label: 'APY Range', value: tmpl.apyRange },
                          ].map(m => (
                            <div key={m.label} style={{ backgroundColor: '#FAFAF8', borderRadius: '6px', padding: '8px 10px' }}>
                              <div style={{ fontSize: '10px', color: '#8A8A8A', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{m.label}</div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B' }}>{m.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {tmpl.verificationTypes.map(v => (
                            <span key={v} style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 500, backgroundColor: 'rgba(27,58,107,0.06)', color: '#1B3A6B', border: '1px solid rgba(27,58,107,0.12)' }}>{v}</span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { if (selectedTemplate) setStrategyStep(2); }}
                    disabled={!selectedTemplate}
                    style={{ backgroundColor: selectedTemplate ? '#1B3A6B' : '#E8E4DC', color: selectedTemplate ? '#FFFFFF' : '#8A8A8A', padding: '12px 28px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: selectedTemplate ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                  >
                    Continue with {selectedTemplate ? STRATEGY_TEMPLATES.find(t => t.id === selectedTemplate)?.name : 'a template'} →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Configure */}
            {strategyStep === 2 && selectedTemplate && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
                <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px' }}>
                  <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', color: '#1B3A6B', marginBottom: '24px' }}>Configure Strategy Parameters</h3>

                  {[
                    { key: 'name', label: 'Vault Name', placeholder: 'e.g. Alpine Catastrophe Fund I', hint: 'Public name shown to investors.' },
                    { key: 'tokenSymbol', label: 'Share Token Symbol', placeholder: 'e.g. ACFI', hint: 'Max 8 characters. ERC-20 symbol for vault shares.' },
                    { key: 'jurisdiction', label: 'Jurisdiction', placeholder: 'e.g. Bermuda, Cayman Islands, SKN', hint: 'Regulatory jurisdiction of the vault manager.' },
                  ].map(field => (
                    <div key={field.key} style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1B3A6B', marginBottom: '6px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>{field.label}</label>
                      <input
                        value={strategyForm[field.key as keyof typeof strategyForm] as string}
                        onChange={e => setStrategyForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #E8E4DC', borderRadius: '8px', fontSize: '14px', color: '#1B3A6B', backgroundColor: '#FFFFFF', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                      />
                      <p style={{ fontSize: '11px', color: '#8A8A8A', marginTop: '4px' }}>{field.hint}</p>
                    </div>
                  ))}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1B3A6B', marginBottom: '6px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>Buffer Ratio (bps)</label>
                      <input
                        type="number"
                        value={strategyForm.bufferBps}
                        onChange={e => setStrategyForm(prev => ({ ...prev, bufferBps: e.target.value }))}
                        min="500" max="5000"
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #E8E4DC', borderRadius: '8px', fontSize: '14px', color: '#1B3A6B', backgroundColor: '#FFFFFF', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                      />
                      <p style={{ fontSize: '11px', color: '#8A8A8A', marginTop: '4px' }}>{(parseInt(strategyForm.bufferBps) / 100).toFixed(1)}% of TVL reserved as liquidity buffer.</p>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1B3A6B', marginBottom: '6px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>Management Fee (bps)</label>
                      <input
                        type="number"
                        value={strategyForm.feeBps}
                        onChange={e => setStrategyForm(prev => ({ ...prev, feeBps: e.target.value }))}
                        min="0" max="500"
                        style={{ width: '100%', padding: '10px 14px', border: '1px solid #E8E4DC', borderRadius: '8px', fontSize: '14px', color: '#1B3A6B', backgroundColor: '#FFFFFF', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}
                      />
                      <p style={{ fontSize: '11px', color: '#8A8A8A', marginTop: '4px' }}>{(parseInt(strategyForm.feeBps) / 100).toFixed(2)}% annual fee on AUM.</p>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#1B3A6B', marginBottom: '10px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>Claim Verification Paths</label>
                    {['permissionless', 'oracle', 'admin'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid #E8E4DC', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer', backgroundColor: strategyForm.verificationTypes.includes(v) ? 'rgba(27,58,107,0.04)' : '#FFFFFF' }}>
                        <input
                          type="checkbox"
                          checked={strategyForm.verificationTypes.includes(v)}
                          onChange={() => {
                            const current = strategyForm.verificationTypes;
                            if (current.includes(v)) {
                              if (current.length > 1) setStrategyForm(prev => ({ ...prev, verificationTypes: current.filter(x => x !== v) }));
                            } else {
                              setStrategyForm(prev => ({ ...prev, verificationTypes: [...current, v] }));
                            }
                          }}
                          style={{ accentColor: '#1B3A6B' }}
                        />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B', textTransform: 'capitalize' }}>{v === 'permissionless' ? 'Permissionless (On-Chain)' : v === 'oracle' ? 'Oracle Reporter' : 'Insurer Admin'}</div>
                          <div style={{ fontSize: '11px', color: '#8A8A8A' }}>{v === 'permissionless' ? 'Automated smart contract verification' : v === 'oracle' ? 'Chainlink or custom data feed' : 'Manual adjudication by vault manager'}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setStrategyStep(1)} style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #E8E4DC', backgroundColor: '#FAFAF8', fontSize: '13px', fontWeight: 500, color: '#1B3A6B', cursor: 'pointer' }}>← Back</button>
                    <button
                      onClick={() => { if (strategyForm.name && strategyForm.tokenSymbol) setStrategyStep(3); }}
                      disabled={!strategyForm.name || !strategyForm.tokenSymbol}
                      style={{ flex: 1, backgroundColor: strategyForm.name && strategyForm.tokenSymbol ? '#1B3A6B' : '#E8E4DC', color: strategyForm.name && strategyForm.tokenSymbol ? '#FFFFFF' : '#8A8A8A', padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: strategyForm.name && strategyForm.tokenSymbol ? 'pointer' : 'not-allowed' }}
                    >
                      Review & Deploy →
                    </button>
                  </div>
                </div>

                {/* Preview panel */}
                <div>
                  <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '24px', position: 'sticky', top: '100px' }}>
                    <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '16px' }}>Strategy Preview</div>
                    <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', fontWeight: 700, color: '#1B3A6B', marginBottom: '4px' }}>
                      {strategyForm.name || 'Vault Name'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8A8A8A', marginBottom: '20px' }}>
                      {strategyForm.tokenSymbol || 'SYMBOL'} · {strategyForm.jurisdiction || 'Jurisdiction'}
                    </div>
                    {[
                      { label: 'Template', value: STRATEGY_TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '' },
                      { label: 'Buffer Ratio', value: `${(parseInt(strategyForm.bufferBps || '0') / 100).toFixed(1)}%` },
                      { label: 'Management Fee', value: `${(parseInt(strategyForm.feeBps || '0') / 100).toFixed(2)}% p.a.` },
                      { label: 'Max Allocation', value: `${((10000 - parseInt(strategyForm.bufferBps || '0')) / 100).toFixed(1)}% of TVL` },
                      { label: 'Verification', value: strategyForm.verificationTypes.join(', ') },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F5F5F0' }}>
                        <span style={{ fontSize: '12px', color: '#8A8A8A' }}>{row.label}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1B3A6B', textAlign: 'right', maxWidth: '160px' }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#FFF7ED', borderRadius: '8px', border: '1px solid #FED7AA' }}>
                      <div style={{ fontSize: '11px', color: '#92400E', fontWeight: 600, marginBottom: '4px' }}>Buffer Note</div>
                      <div style={{ fontSize: '11px', color: '#92400E', lineHeight: '1.5' }}>
                        With a {(parseInt(strategyForm.bufferBps || '0') / 100).toFixed(1)}% buffer, you can allocate up to {((10000 - parseInt(strategyForm.bufferBps || '0')) / 100).toFixed(1)}% of TVL across policies.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Review & Deploy */}
            {strategyStep === 3 && (
              <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px' }}>
                  <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', color: '#1B3A6B', marginBottom: '8px' }}>Review & Deploy</h3>
                  <p style={{ fontSize: '13px', color: '#8A8A8A', marginBottom: '24px' }}>Review your strategy configuration before deploying the vault on-chain.</p>

                  <div style={{ backgroundColor: '#FAFAF8', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
                    {[
                      { label: 'Vault Name', value: strategyForm.name },
                      { label: 'Token Symbol', value: strategyForm.tokenSymbol },
                      { label: 'Template', value: STRATEGY_TEMPLATES.find(t => t.id === selectedTemplate)?.name ?? '' },
                      { label: 'Jurisdiction', value: strategyForm.jurisdiction || '—' },
                      { label: 'Buffer Ratio', value: `${(parseInt(strategyForm.bufferBps) / 100).toFixed(1)}% (${strategyForm.bufferBps} bps)` },
                      { label: 'Management Fee', value: `${(parseInt(strategyForm.feeBps) / 100).toFixed(2)}% p.a. (${strategyForm.feeBps} bps)` },
                      { label: 'Max Policy Allocation', value: `${((10000 - parseInt(strategyForm.bufferBps)) / 100).toFixed(1)}% of TVL` },
                      { label: 'Verification Paths', value: strategyForm.verificationTypes.join(', ') },
                      { label: 'Vault Manager', value: `${address?.slice(0, 6)}...${address?.slice(-4)}` },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #EEEBE4' }}>
                        <span style={{ fontSize: '13px', color: '#8A8A8A' }}>{row.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ backgroundColor: '#EFF6FF', borderRadius: '8px', padding: '14px 16px', marginBottom: '24px', border: '1px solid #BFDBFE' }}>
                    <div style={{ fontSize: '12px', color: '#1E40AF', fontWeight: 600, marginBottom: '4px' }}>On-chain deployment</div>
                    <div style={{ fontSize: '12px', color: '#1E40AF', lineHeight: '1.5' }}>
                      This will call <code style={{ backgroundColor: 'rgba(30,64,175,0.1)', padding: '1px 5px', borderRadius: '3px' }}>VaultFactory.createVault()</code> on Base. You will be set as vault manager. Gas fees apply.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => setStrategyStep(2)} style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #E8E4DC', backgroundColor: '#FAFAF8', fontSize: '13px', fontWeight: 500, color: '#1B3A6B', cursor: 'pointer' }}>← Back</button>
                    <Link
                      href={`/app/create-vault?name=${encodeURIComponent(strategyForm.name)}&symbol=${encodeURIComponent(strategyForm.tokenSymbol)}&buffer=${strategyForm.bufferBps}&fee=${strategyForm.feeBps}`}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}
                    >
                      <CheckCircle2 size={15} /> Deploy Vault On-Chain
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* POLICIES TAB */}
        {activeTab === 'policies' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', color: '#1B3A6B', margin: 0 }}>Policy Pool</h2>
              <Link href="/app/vault/0xF725B7E9176F1F2D0B9b3D0e3E5e1b1C5e2D3A4B/manage" style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                <Plus size={14} /> Register Policy
              </Link>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
              <FileText size={32} color="#E8E4DC" style={{ marginBottom: '16px' }} />
              <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '18px', color: '#1B3A6B', marginBottom: '8px' }}>Register Policies via Vault Manager</h3>
              <p style={{ fontSize: '13px', color: '#8A8A8A', lineHeight: '1.6', maxWidth: '400px', margin: '0 auto 24px' }}>
                Policies are registered and managed through the vault management interface. Navigate to your vault to register new policies, set coverage amounts, and manage premiums.
              </p>
              <Link href="/app/vault/0xF725B7E9176F1F2D0B9b3D0e3E5e1b1C5e2D3A4B/manage" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                Go to Vault Manager
              </Link>
            </div>
          </div>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === 'performance' && (
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', color: '#1B3A6B', marginBottom: '24px' }}>Performance Analytics</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {[
                { label: 'Total Premiums Collected', value: '$2,940', sub: 'All time' },
                { label: 'Claims Paid', value: '$420', sub: '14.3% loss ratio' },
                { label: 'Net Underwriting Profit', value: '$2,520', sub: 'All time' },
              ].map(stat => (
                <div key={stat.label} style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '24px' }}>
                  <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>{stat.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#1B3A6B', fontFamily: '"Playfair Display", Georgia, serif', marginBottom: '4px' }}>{stat.value}</div>
                  <div style={{ fontSize: '12px', color: '#8A8A8A' }}>{stat.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
              <BarChart2 size={32} color="#E8E4DC" style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '13px', color: '#8A8A8A' }}>Historical performance charts will be available once the vault has been active for 30+ days.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
