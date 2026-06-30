'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useProtocolAccess } from '@/hooks/useProtocolAccess';
import { DataSourceBadge, UnavailableNotice } from '@/components/shared/DataSourceBadge';
import {
  kybApplicationPayloadSchema,
  KYB_CHAIN_ID,
  type KybApplicationPayload,
  type KybStatus,
} from '@/lib/kyb/schema';

// Self-service onboarding is scoped to the two financial participants of the
// protocol: the Institutional LP (capital provider) and the Underwriting
// Curator (strategy/risk). The Cedant / Reinsurer onboards through the
// dedicated operator-assisted flow at /app/cedant/onboard, not here.
//
// Authorization is resolved ON-CHAIN: ProtocolRoles (UNDERWRITING_CURATOR_ROLE)
// and ComplianceRegistry.canReceive (Institutional LP whitelist / nbUSDC
// eligibility). This page submits the institutional KYB/KYC record to the
// backend (reviewed by the KYC Operator); the on-chain whitelist or role grant
// remains a separate authorized act after due diligence.

type Role = 'lp' | 'curator' | null;
type Step = 'choose' | 'form' | 'submitted';

const INVESTOR_TYPES = [
  'Pension Fund',
  'Insurance / Reinsurance Company',
  'Sovereign Wealth / Endowment',
  'Hedge Fund',
  'Family Office',
  'Asset Manager',
  'Bank / Treasury',
  'Other',
];

const JURISDICTIONS = [
  'Saint Kitts & Nevis',
  'Cayman Islands',
  'Bermuda',
  'Luxembourg',
  'Switzerland',
  'United Kingdom',
  'United States',
  'Singapore',
  'Other',
];

export default function ApplyPage() {
  const { address, isConnected } = useAccount();
  const [role, setRole] = useState<Role>(null);
  const [step, setStep] = useState<Step>('choose');

  // Institutional LP form state
  const [lpForm, setLpForm] = useState({
    entityName: '',
    investorType: '',
    jurisdiction: '',
    aum: '',
    regulator: '',
    contactName: '',
    contactEmail: '',
    website: '',
    walletAddress: address ?? '',
    mandate: '',
    qualifiedInvestor: false,
    agreedTerms: false,
  });

  // Underwriting Curator form state
  const [curForm, setCurForm] = useState({
    entityName: '',
    entityType: '',
    jurisdiction: '',
    licenseNumber: '',
    strategy: '',
    aum: '',
    contactName: '',
    contactEmail: '',
    website: '',
    walletAddress: address ?? '',
    description: '',
    agreedTerms: false,
  });

  // ON-CHAIN authorization status. The LP "approved" signal is ComplianceRegistry
  // whitelist eligibility (canReceive), NOT a ProtocolRoles role; the Curator is
  // a role grant.
  const access = useProtocolAccess();
  const isLpApproved = access.status === 'onchain' && access.isCompliantLP;
  const isCuratorApproved = access.status === 'onchain' && access.isCurator;
  const rolesUnavailable = access.status === 'unavailable';

  // Real submit pipeline state. 'unavailable' = backend not configured/down:
  // shown explicitly, never silently faked as success.
  type SubmitState = 'idle' | 'submitting' | 'error' | 'unavailable';
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Existing applications for the connected wallet (status only, no PII).
  type MyApp = { applicantType: string; status: KybStatus; createdAt: string };
  type MyAppsState = { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; apps: MyApp[] };
  const [myApps, setMyApps] = useState<MyAppsState>({ kind: 'loading' });

  const refreshMyApps = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/kyb/applications/status?wallet=${address}`);
      if (!res.ok) {
        setMyApps({ kind: 'unavailable' });
        return;
      }
      const data = await res.json();
      setMyApps({ kind: 'ready', apps: data.applications ?? [] });
    } catch {
      setMyApps({ kind: 'unavailable' });
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kyb/applications/status?wallet=${address}`);
        if (cancelled) return;
        if (!res.ok) {
          setMyApps({ kind: 'unavailable' });
          return;
        }
        const data = await res.json();
        if (!cancelled) setMyApps({ kind: 'ready', apps: data.applications ?? [] });
      } catch {
        if (!cancelled) setMyApps({ kind: 'unavailable' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const submitApplication = async (payload: KybApplicationPayload) => {
    const parsed = kybApplicationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitState('error');
      setSubmitError(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    setSubmitState('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/kyb/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 503) {
        setSubmitState('unavailable');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitState('error');
        setSubmitError(
          typeof data.error === 'string'
            ? data.issues
              ? `${data.error}: ${(data.issues as string[]).join('; ')}`
              : data.error
            : `HTTP ${res.status}`,
        );
        return;
      }
      setSubmitState('idle');
      setStep('submitted');
      void refreshMyApps();
    } catch {
      setSubmitState('error');
      setSubmitError('Network error while reaching the KYB backend.');
    }
  };

  const handleLpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitApplication({
      applicantType: 'lp',
      walletAddress: (lpForm.walletAddress || address || '') as string,
      companyName: lpForm.entityName,
      legalEntityType: lpForm.investorType,
      jurisdiction: lpForm.jurisdiction,
      licenseNumber: lpForm.regulator,
      declaredPortfolio: lpForm.aum,
      contactName: lpForm.contactName,
      contactEmail: lpForm.contactEmail,
      website: lpForm.website,
      description: [
        lpForm.investorType ? `[Investor type: ${lpForm.investorType}]` : '',
        lpForm.qualifiedInvestor ? '[Qualified/Professional investor: confirmed]' : '',
        lpForm.mandate,
      ].filter(Boolean).join(' ').trim(),
      chainId: KYB_CHAIN_ID,
    });
  };

  const handleCurSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitApplication({
      applicantType: 'curator',
      walletAddress: (curForm.walletAddress || address || '') as string,
      companyName: curForm.entityName,
      legalEntityType: curForm.entityType,
      jurisdiction: curForm.jurisdiction,
      licenseNumber: curForm.licenseNumber,
      declaredPortfolio: curForm.aum,
      contactName: curForm.contactName,
      contactEmail: curForm.contactEmail,
      website: curForm.website,
      description: curForm.strategy
        ? `[Strategy: ${curForm.strategy}] ${curForm.description}`.trim()
        : curForm.description,
      chainId: KYB_CHAIN_ID,
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid rgba(27,58,107,0.2)',
    borderRadius: '8px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    color: '#0F1218',
    background: '#FFFFFF',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#1B3A6B',
    marginBottom: '6px',
    display: 'block',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      {rolesUnavailable && isConnected && (
        <div style={{ padding: '16px 32px 0' }}>
          <UnavailableNotice what="On-chain role verification (ProtocolRoles / ComplianceRegistry)" />
        </div>
      )}
      {/* Existing applications for the connected wallet (real backend state) */}
      {isConnected && (
        <div style={{ padding: '16px 32px 0' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.15)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#1B3A6B' }}>
              Your applications:
            </span>
            {myApps.kind === 'loading' && (
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>checking...</span>
            )}
            {myApps.kind === 'unavailable' && (
              <>
                <span style={{ fontSize: '12px', color: '#9CA3AF' }}>status unavailable (KYB backend not reachable)</span>
                <DataSourceBadge source="unavailable" />
              </>
            )}
            {myApps.kind === 'ready' && myApps.apps.length === 0 && (
              <>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>none on record for this wallet</span>
                <DataSourceBadge source="backend" />
              </>
            )}
            {myApps.kind === 'ready' && myApps.apps.map((a, i) => (
              <span key={i} style={{ fontSize: '12px', color: '#374151', background: '#F3F4F6', borderRadius: '9999px', padding: '3px 10px' }}>
                {a.applicantType === 'lp' ? 'Institutional LP' : a.applicantType === 'cedant' ? 'Cedant' : 'Curator'}: <strong>{a.status.replace('_', ' ')}</strong>
              </span>
            ))}
            {myApps.kind === 'ready' && myApps.apps.length > 0 && <DataSourceBadge source="backend" />}
          </div>
        </div>
      )}
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F1218 0%, #1B3A6B 100%)',
          padding: '48px 32px 56px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: "url('/assets/ships-illustration.jpg')",
            backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.07,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(15,18,24,0.95) 0%, rgba(27,58,107,0.6) 100%)' }} />
        <div className="relative z-10 mx-auto" style={{ maxWidth: '860px' }}>
          <Link href="/app" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
            ← Back to Vaults
          </Link>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, color: '#FFFFFF', marginTop: '20px', marginBottom: '12px', lineHeight: 1.15 }}>
            Join NextBlock
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', color: 'rgba(255,255,255,0.6)', maxWidth: '560px', lineHeight: 1.6 }}>
            NextBlock is an institutional protocol for tokenized reinsurance portfolios, open to qualified institutional participants only. Apply for on-chain authorization as an Institutional LP (capital provider) or as an Underwriting Curator. Insurers / reinsurers ceding risk onboard through the dedicated cedant flow.
          </p>
        </div>
      </div>

      <div className="mx-auto" style={{ maxWidth: '860px', padding: '40px 32px 80px' }}>

        {/* Already approved banners */}
        {isLpApproved && (
          <div style={{ background: 'rgba(22,101,52,0.08)', border: '1px solid rgba(22,101,52,0.25)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#166534', margin: 0 }}>Your wallet is whitelisted as an Institutional LP (eligible to hold nbUSDC)</p>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#166534', opacity: 0.8, margin: '2px 0 0' }}>
                You can deposit USDC and receive nbUSDC vault shares. <Link href="/app" style={{ color: '#166534', fontWeight: 600 }}>Browse vaults →</Link>
              </p>
            </div>
          </div>
        )}
        {isCuratorApproved && !isLpApproved && (
          <div style={{ background: 'rgba(27,58,107,0.06)', border: '1px solid rgba(27,58,107,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#1B3A6B', margin: 0 }}>Your wallet is authorized as a Syndicate (UNDERWRITING_CURATOR_ROLE)</p>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#1B3A6B', opacity: 0.8, margin: '2px 0 0' }}>
                You can deploy insurance vaults. <Link href="/app/create-vault" style={{ color: '#1B3A6B', fontWeight: 600 }}>Create a vault →</Link>
              </p>
            </div>
          </div>
        )}

        {/* ── STEP: Choose role ── */}
        {step === 'choose' && (
          <>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: '#0F1218', marginBottom: '8px' }}>
              Select your role
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#6B7280', marginBottom: '28px' }}>
              Choose the type of access you are applying for. Each role has different requirements and capabilities.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '32px' }}>
              {/* Institutional LP Card */}
              <button
                onClick={() => { setRole('lp'); setStep('form'); }}
                style={{
                  background: role === 'lp' ? 'rgba(27,58,107,0.06)' : '#FFFFFF',
                  border: `2px solid ${role === 'lp' ? '#1B3A6B' : 'rgba(27,58,107,0.15)'}`,
                  borderRadius: '16px',
                  padding: '28px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(27,58,107,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="1.5">
                      <path d="M3 21h18M5 21V7l8-4 8 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: 400, color: '#0F1218', margin: 0 }}>Institutional LP</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#6B7280', margin: '2px 0 0' }}>Qualified institutional investor</p>
                  </div>
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '16px' }}>
                  Provide capital to tokenized reinsurance vaults. Deposit USDC, receive restricted nbUSDC shares, and earn reinsurance-backed yield with continuous NAV.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    'Deposit USDC into institutional vaults',
                    'Hold restricted nbUSDC shares (ERC-3643)',
                    'Earn reinsurance premium yield (UPR-based NAV)',
                    'Redeem within buffer / via redemption queue',
                  ].map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#374151' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px', padding: '8px 14px', background: 'rgba(27,58,107,0.08)', borderRadius: '8px', display: 'inline-block' }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 600, color: '#1B3A6B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Requires KYC/KYB + Whitelist (ComplianceRegistry)</span>
                </div>
              </button>

              {/* Underwriting Curator Card */}
              <button
                onClick={() => { setRole('curator'); setStep('form'); }}
                style={{
                  background: role === 'curator' ? 'rgba(201,168,76,0.06)' : '#FFFFFF',
                  border: `2px solid ${role === 'curator' ? '#C9A84C' : 'rgba(201,168,76,0.3)'}`,
                  borderRadius: '16px',
                  padding: '28px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(201,168,76,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: 400, color: '#0F1218', margin: 0 }}>Syndicate</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#6B7280', margin: '2px 0 0' }}>Managing agent · underwriting (Lloyd&apos;s-style)</p>
                  </div>
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '16px' }}>
                  Design and deploy insurance risk strategies. Curators set vault parameters, select policies, and manage capital allocation for institutional investors.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    'Deploy custom insurance vault strategies',
                    'Set risk parameters and allocation',
                    'Earn management fees on AUM',
                    'Build track record on-chain',
                  ].map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#374151' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px', padding: '8px 14px', background: 'rgba(201,168,76,0.1)', borderRadius: '8px', display: 'inline-block' }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 600, color: '#92400E', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Requires KYC + Strategy Review</span>
                </div>
              </button>
            </div>

            {/* Cedant pointer */}
            <div style={{ background: '#FFFFFF', border: '1px dashed rgba(27,58,107,0.3)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151' }}>
                Are you an insurer / reinsurer looking to cede risk and tokenize a portfolio?
              </span>
              <Link href="/app/cedant/onboard" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 600, color: '#1B3A6B', textDecoration: 'none' }}>
                Go to Cedant onboarding →
              </Link>
            </div>
          </>
        )}

        {/* ── STEP: Institutional LP Form ── */}
        {step === 'form' && role === 'lp' && (
          <form onSubmit={handleLpSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <button type="button" onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>
                ← Back
              </button>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: '#0F1218', margin: 0 }}>
                Institutional LP — Investor Onboarding
              </h2>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(27,58,107,0.1)' }}>
                Entity Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Institutional Entity / Fund Name *</label>
                  <input required style={inputStyle} placeholder="e.g. Helvetia Pension Fund" value={lpForm.entityName} onChange={e => setLpForm(f => ({ ...f, entityName: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Investor Type *</label>
                  <select required style={inputStyle} value={lpForm.investorType} onChange={e => setLpForm(f => ({ ...f, investorType: e.target.value }))}>
                    <option value="">Select type</option>
                    {INVESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Jurisdiction *</label>
                  <select required style={inputStyle} value={lpForm.jurisdiction} onChange={e => setLpForm(f => ({ ...f, jurisdiction: e.target.value }))}>
                    <option value="">Select jurisdiction</option>
                    {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Assets Under Management (USD)</label>
                  <input style={inputStyle} placeholder="e.g. $250,000,000" value={lpForm.aum} onChange={e => setLpForm(f => ({ ...f, aum: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Regulator / License (optional)</label>
                  <input style={inputStyle} placeholder="e.g. FINMA, FCA, SEC RIA — reg. no." value={lpForm.regulator} onChange={e => setLpForm(f => ({ ...f, regulator: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(27,58,107,0.1)' }}>
                Contact &amp; Wallet
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Contact Name *</label>
                  <input required style={inputStyle} placeholder="John Smith" value={lpForm.contactName} onChange={e => setLpForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Email *</label>
                  <input required type="email" style={inputStyle} placeholder="john@institution.com" value={lpForm.contactEmail} onChange={e => setLpForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input style={inputStyle} placeholder="https://institution.com" value={lpForm.website} onChange={e => setLpForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Wallet Address *</label>
                  <input
                    required
                    style={{ ...inputStyle, background: address ? '#F9FAFB' : '#FFFFFF', fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="0x..."
                    value={lpForm.walletAddress || address || ''}
                    onChange={e => setLpForm(f => ({ ...f, walletAddress: e.target.value }))}
                  />
                  {address && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>Auto-filled from connected wallet — this is the address that will be whitelisted</p>}
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>Investment Mandate / Notes</label>
                <textarea
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="Describe your mandate, ticket size, allocation horizon and any compliance constraints relevant to onboarding..."
                  value={lpForm.mandate}
                  onChange={e => setLpForm(f => ({ ...f, mandate: e.target.value }))}
                />
              </div>
            </div>

            {/* Process timeline */}
            <div style={{ background: 'rgba(27,58,107,0.04)', border: '1px solid rgba(27,58,107,0.1)', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '14px' }}>Onboarding Process</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { step: '01', title: 'Application Submitted', time: 'Immediate' },
                  { step: '02', title: 'KYC / KYB + Sanctions', time: '2–5 business days' },
                  { step: '03', title: 'Whitelist (ComplianceRegistry)', time: 'Upon approval' },
                  { step: '04', title: 'Deposit USDC → nbUSDC', time: 'Self-service after' },
                ].map((s) => (
                  <div key={s.step} style={{ flex: '1', minWidth: '140px' }}>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: 'rgba(27,58,107,0.3)', margin: '0 0 4px' }}>{s.step}</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#1B3A6B', margin: '0 0 2px' }}>{s.title}</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9A9A9A', margin: 0 }}>{s.time}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
              <input
                type="checkbox"
                id="qualified-lp"
                required
                checked={lpForm.qualifiedInvestor}
                onChange={e => setLpForm(f => ({ ...f, qualifiedInvestor: e.target.checked }))}
                style={{ marginTop: '2px', accentColor: '#1B3A6B' }}
              />
              <label htmlFor="qualified-lp" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}>
                I confirm that the applicant is a <strong>qualified / professional institutional investor</strong> and not a retail participant, and meets the eligibility requirements of its jurisdiction.
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px' }}>
              <input
                type="checkbox"
                id="terms-lp"
                required
                checked={lpForm.agreedTerms}
                onChange={e => setLpForm(f => ({ ...f, agreedTerms: e.target.checked }))}
                style={{ marginTop: '2px', accentColor: '#1B3A6B' }}
              />
              <label htmlFor="terms-lp" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}>
                I confirm that the information provided is accurate. I agree to NextBlock&apos;s{' '}
                <Link href="/" style={{ color: '#1B3A6B', textDecoration: 'underline' }}>Terms of Service</Link> and{' '}
                <Link href="/" style={{ color: '#1B3A6B', textDecoration: 'underline' }}>Privacy Policy</Link>.
              </label>
            </div>

            {submitState === 'error' && submitError && (
              <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(127,29,29,0.06)', border: '1px solid rgba(127,29,29,0.2)', color: '#7F1D1D', fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                Submission failed: {submitError}
              </div>
            )}
            {submitState === 'unavailable' && (
              <div style={{ marginBottom: '16px' }}>
                <UnavailableNotice what="The KYB backend" />
              </div>
            )}
            <button
              type="submit"
              disabled={submitState === 'submitting' || !lpForm.agreedTerms || !lpForm.qualifiedInvestor}
              style={{
                background: 'linear-gradient(135deg, #1B3A6B 0%, #2D5A9E 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                cursor: submitState === 'submitting' ? 'wait' : 'pointer',
                letterSpacing: '0.02em',
                opacity: submitState === 'submitting' || !lpForm.agreedTerms || !lpForm.qualifiedInvestor ? 0.6 : 1,
              }}
            >
              {submitState === 'submitting' ? 'Submitting...' : 'Submit LP Application'}
            </button>
          </form>
        )}

        {/* ── STEP: Underwriting Curator Form ── */}
        {step === 'form' && role === 'curator' && (
          <form onSubmit={handleCurSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <button type="button" onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>
                ← Back
              </button>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: '#0F1218', margin: 0 }}>
                Syndicate Application — Underwriting Curator
              </h2>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
                Entity Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Entity / Fund Name *</label>
                  <input required style={inputStyle} placeholder="Alpine Re Capital" value={curForm.entityName} onChange={e => setCurForm(f => ({ ...f, entityName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Entity Type *</label>
                  <select required style={inputStyle} value={curForm.entityType} onChange={e => setCurForm(f => ({ ...f, entityType: e.target.value }))}>
                    <option value="">Select type</option>
                    <option>Asset Manager</option>
                    <option>Reinsurer</option>
                    <option>Risk Strategist</option>
                    <option>Family Office</option>
                    <option>Hedge Fund</option>
                    <option>Individual / Independent</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Jurisdiction *</label>
                  <select required style={inputStyle} value={curForm.jurisdiction} onChange={e => setCurForm(f => ({ ...f, jurisdiction: e.target.value }))}>
                    <option value="">Select jurisdiction</option>
                    {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>License / Registration (if applicable)</label>
                  <input style={inputStyle} placeholder="Optional" value={curForm.licenseNumber} onChange={e => setCurForm(f => ({ ...f, licenseNumber: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Proposed Vault Strategy *</label>
                  <input required style={inputStyle} placeholder="e.g. Parametric nat-cat, diversified reinsurance..." value={curForm.strategy} onChange={e => setCurForm(f => ({ ...f, strategy: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Assets Under Management (USD)</label>
                  <input style={inputStyle} placeholder="e.g. $10,000,000" value={curForm.aum} onChange={e => setCurForm(f => ({ ...f, aum: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(201,168,76,0.25)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400E', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
                Contact &amp; Wallet
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Contact Name *</label>
                  <input required style={inputStyle} placeholder="Jane Doe" value={curForm.contactName} onChange={e => setCurForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Contact Email *</label>
                  <input required type="email" style={inputStyle} placeholder="jane@fund.com" value={curForm.contactEmail} onChange={e => setCurForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Website</label>
                  <input style={inputStyle} placeholder="https://fund.com" value={curForm.website} onChange={e => setCurForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: '#92400E' }}>Wallet Address *</label>
                  <input
                    required
                    style={{ ...inputStyle, background: address ? '#F9FAFB' : '#FFFFFF', fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="0x..."
                    value={curForm.walletAddress || address || ''}
                    onChange={e => setCurForm(f => ({ ...f, walletAddress: e.target.value }))}
                  />
                  {address && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>Auto-filled from connected wallet</p>}
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{ ...labelStyle, color: '#92400E' }}>Strategy Description *</label>
                <textarea
                  required
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="Describe your vault strategy, risk management approach, target policies, and expected yield profile..."
                  value={curForm.description}
                  onChange={e => setCurForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px' }}>
              <input
                type="checkbox"
                id="terms-cur"
                required
                checked={curForm.agreedTerms}
                onChange={e => setCurForm(f => ({ ...f, agreedTerms: e.target.checked }))}
                style={{ marginTop: '2px', accentColor: '#C9A84C' }}
              />
              <label htmlFor="terms-cur" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}>
                I confirm that the information provided is accurate and complete. I agree to NextBlock&apos;s{' '}
                <Link href="/" style={{ color: '#C9A84C', textDecoration: 'underline' }}>Terms of Service</Link> and{' '}
                <Link href="/" style={{ color: '#C9A84C', textDecoration: 'underline' }}>Privacy Policy</Link>.
              </label>
            </div>

            <button
              type="submit"
              disabled={submitState === 'submitting' || !curForm.agreedTerms}
              style={{
                background: 'linear-gradient(135deg, #92400E 0%, #C9A84C 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                cursor: submitState === 'submitting' ? 'wait' : 'pointer',
                letterSpacing: '0.02em',
                opacity: submitState === 'submitting' || !curForm.agreedTerms ? 0.6 : 1,
              }}
            >
              {submitState === 'submitting' ? 'Submitting...' : 'Submit Curator Application'}
            </button>
            {submitState === 'error' && submitError && (
              <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(127,29,29,0.06)', border: '1px solid rgba(127,29,29,0.2)', color: '#7F1D1D', fontSize: '13px', fontFamily: "'Inter', sans-serif" }}>
                Submission failed: {submitError}
              </div>
            )}
            {submitState === 'unavailable' && (
              <div style={{ marginTop: '16px' }}>
                <UnavailableNotice what="The KYB backend" />
              </div>
            )}
          </form>
        )}

        {/* ── STEP: Submitted ── */}
        {step === 'submitted' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(22,101,52,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 400, color: '#0F1218', marginBottom: '12px' }}>
              Application Submitted
            </h2>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', color: '#6B7280', maxWidth: '480px', margin: '0 auto 8px', lineHeight: 1.6 }}>
              Thank you for applying to NextBlock. Our team will review your{' '}
              {role === 'lp' ? 'institutional LP' : 'syndicate'} application and contact you at the provided email address.
            </p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#9A9A9A', marginBottom: '32px' }}>
              Review typically takes <strong>3–7 business days</strong>.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/app"
                style={{
                  background: '#1B3A6B',
                  color: '#FFFFFF',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Browse Vaults
              </Link>
              <Link
                href="/app/syndicates"
                style={{
                  background: 'transparent',
                  color: '#1B3A6B',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  border: '1px solid rgba(27,58,107,0.3)',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                View Syndicates
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
