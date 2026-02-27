'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

// ─── Whitelist pre-approvati ───────────────────────────────────────────────
// Insurance Company admins — hanno accesso diretto alla gestione vault
export const INSURANCE_COMPANY_WHITELIST: string[] = [
  '0x3630082d96065b756e84b8b79e030a525b9583ed', // NextBlock Primary Admin
  '0x810fa6726eeb6014c2f77bb4802a5734c28b0f3e', // NextBlock Co-Admin (Anton Carlo)
];

// Syndicate Manager whitelist — possono creare vault e gestire strategie
export const CURATOR_WHITELIST: string[] = [
  '0x3630082d96065b756e84b8b79e030a525b9583ed', // NextBlock Primary Admin — accesso completo
  '0x810fa6726eeb6014c2f77bb4802a5734c28b0f3e', // NextBlock Co-Admin (Anton Carlo) — accesso completo
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
];

type Role = 'insurance' | 'syndicate manager' | null;
type Step = 'choose' | 'form' | 'submitted';

const INSURANCE_TYPES = [
  'Property & Casualty (P&C)',
  'Life & Health',
  'Marine & Aviation',
  'Catastrophe / Nat-Cat',
  'Cyber & Technology',
  'Parametric',
  'Reinsurer',
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

  // Insurance Company form state
  const [insForm, setInsForm] = useState({
    companyName: '',
    legalEntity: '',
    jurisdiction: '',
    licenseNumber: '',
    insuranceType: '',
    portfolioSize: '',
    contactName: '',
    contactEmail: '',
    website: '',
    walletAddress: address ?? '',
    description: '',
    agreedTerms: false,
  });

  // Syndicate Manager form state
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

  // Check if already approved
  const isInsuranceApproved = isConnected && address
    ? INSURANCE_COMPANY_WHITELIST.includes(address.toLowerCase())
    : false;
  const isCuratorApproved = isConnected && address
    ? CURATOR_WHITELIST.includes(address.toLowerCase())
    : false;

  const handleInsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('submitted');
  };

  const handleCurSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('submitted');
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
            NextBlock is an institutional-grade protocol for tokenized insurance risk. Apply for access as an insurance company or as a vault syndicate manager.
          </p>
        </div>
      </div>

      <div className="mx-auto" style={{ maxWidth: '860px', padding: '40px 32px 80px' }}>

        {/* Already approved banners */}
        {isInsuranceApproved && (
          <div style={{ background: 'rgba(22,101,52,0.08)', border: '1px solid rgba(22,101,52,0.25)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#166534', margin: 0 }}>Your wallet is approved as Insurance Company Admin</p>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#166534', opacity: 0.8, margin: '2px 0 0' }}>
                You have full access to vault creation and management. <Link href="/app/create-vault" style={{ color: '#166534', fontWeight: 600 }}>Create a vault →</Link>
              </p>
            </div>
          </div>
        )}
        {isCuratorApproved && !isInsuranceApproved && (
          <div style={{ background: 'rgba(27,58,107,0.06)', border: '1px solid rgba(27,58,107,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '14px', fontWeight: 600, color: '#1B3A6B', margin: 0 }}>Your wallet is approved as Syndicate Manager</p>
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
              {/* Insurance Company Card */}
              <button
                onClick={() => { setRole('insurance'); setStep('form'); }}
                style={{
                  background: role === 'insurance' ? 'rgba(27,58,107,0.06)' : '#FFFFFF',
                  border: `2px solid ${role === 'insurance' ? '#1B3A6B' : 'rgba(27,58,107,0.15)'}`,
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
                      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-3.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V21" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: 400, color: '#0F1218', margin: 0 }}>Insurance Company</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#6B7280', margin: '2px 0 0' }}>Licensed insurer or reinsurer</p>
                  </div>
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '16px' }}>
                  Tokenize your existing insurance portfolio. Upload policies, set coverage parameters, and access institutional liquidity through NextBlock vaults.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    'Create and manage insurance vaults',
                    'Register and tokenize policy portfolios',
                    'Deposit premiums and manage claims',
                    'Access co-insurance liquidity',
                  ].map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#374151' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '20px', padding: '8px 14px', background: 'rgba(27,58,107,0.08)', borderRadius: '8px', display: 'inline-block' }}>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', fontWeight: 600, color: '#1B3A6B', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Requires KYB + License Verification</span>
                </div>
              </button>

              {/* Syndicate Manager Card */}
              <button
                onClick={() => { setRole('syndicate manager'); setStep('form'); }}
                style={{
                  background: role === 'syndicate manager' ? 'rgba(201,168,76,0.06)' : '#FFFFFF',
                  border: `2px solid ${role === 'syndicate manager' ? '#C9A84C' : 'rgba(201,168,76,0.3)'}`,
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
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: 400, color: '#0F1218', margin: 0 }}>Vault Syndicate Manager</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: '#6B7280', margin: '2px 0 0' }}>Asset manager or risk strategist</p>
                  </div>
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.6, marginBottom: '16px' }}>
                  Design and deploy insurance risk strategies. Syndicates set vault parameters, select policies, and manage capital allocation for institutional investors.
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
          </>
        )}

        {/* ── STEP: Insurance Company Form ── */}
        {step === 'form' && role === 'insurance' && (
          <form onSubmit={handleInsSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <button type="button" onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>
                ← Back
              </button>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: '#0F1218', margin: 0 }}>
                Insurance Company Application
              </h2>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(27,58,107,0.1)' }}>
                Entity Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Company Name *</label>
                  <input required style={inputStyle} placeholder="Klapton Re Ltd." value={insForm.companyName} onChange={e => setInsForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Legal Entity Type *</label>
                  <input required style={inputStyle} placeholder="IBC / LLC / S.A. / Ltd." value={insForm.legalEntity} onChange={e => setInsForm(f => ({ ...f, legalEntity: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Jurisdiction *</label>
                  <select required style={inputStyle} value={insForm.jurisdiction} onChange={e => setInsForm(f => ({ ...f, jurisdiction: e.target.value }))}>
                    <option value="">Select jurisdiction</option>
                    {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>License / Registration Number *</label>
                  <input required style={inputStyle} placeholder="e.g. SKN-INS-2024-0042" value={insForm.licenseNumber} onChange={e => setInsForm(f => ({ ...f, licenseNumber: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Insurance Type *</label>
                  <select required style={inputStyle} value={insForm.insuranceType} onChange={e => setInsForm(f => ({ ...f, insuranceType: e.target.value }))}>
                    <option value="">Select type</option>
                    {INSURANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Portfolio Size (USD) *</label>
                  <input required style={inputStyle} placeholder="e.g. $5,000,000" value={insForm.portfolioSize} onChange={e => setInsForm(f => ({ ...f, portfolioSize: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid rgba(27,58,107,0.12)', borderRadius: '16px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid rgba(27,58,107,0.1)' }}>
                Contact & Wallet
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Contact Name *</label>
                  <input required style={inputStyle} placeholder="John Smith" value={insForm.contactName} onChange={e => setInsForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Contact Email *</label>
                  <input required type="email" style={inputStyle} placeholder="john@company.com" value={insForm.contactEmail} onChange={e => setInsForm(f => ({ ...f, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input style={inputStyle} placeholder="https://company.com" value={insForm.website} onChange={e => setInsForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Wallet Address (Admin) *</label>
                  <input
                    required
                    style={{ ...inputStyle, background: address ? '#F9FAFB' : '#FFFFFF', fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="0x..."
                    value={insForm.walletAddress || address || ''}
                    onChange={e => setInsForm(f => ({ ...f, walletAddress: e.target.value }))}
                  />
                  {address && <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>Auto-filled from connected wallet</p>}
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={labelStyle}>Portfolio Description *</label>
                <textarea
                  required
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                  placeholder="Describe your insurance portfolio, risk categories, geographic exposure, and how you plan to use NextBlock for tokenization..."
                  value={insForm.description}
                  onChange={e => setInsForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Process timeline */}
            <div style={{ background: 'rgba(27,58,107,0.04)', border: '1px solid rgba(27,58,107,0.1)', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1B3A6B', marginBottom: '14px' }}>Review Process</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {[
                  { step: '01', title: 'Application Submitted', time: 'Immediate' },
                  { step: '02', title: 'KYB & License Review', time: '2–5 business days' },
                  { step: '03', title: 'Compliance Check', time: '1–3 business days' },
                  { step: '04', title: 'Wallet Whitelisted', time: 'Upon approval' },
                ].map((s) => (
                  <div key={s.step} style={{ flex: '1', minWidth: '140px' }}>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: 'rgba(27,58,107,0.3)', margin: '0 0 4px' }}>{s.step}</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 600, color: '#1B3A6B', margin: '0 0 2px' }}>{s.title}</p>
                    <p style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#9A9A9A', margin: 0 }}>{s.time}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px' }}>
              <input
                type="checkbox"
                id="terms-ins"
                required
                checked={insForm.agreedTerms}
                onChange={e => setInsForm(f => ({ ...f, agreedTerms: e.target.checked }))}
                style={{ marginTop: '2px', accentColor: '#1B3A6B' }}
              />
              <label htmlFor="terms-ins" style={{ fontFamily: "'Inter', sans-serif", fontSize: '13px', color: '#374151', lineHeight: 1.5, cursor: 'pointer' }}>
                I confirm that the information provided is accurate and that my entity holds a valid insurance or reinsurance license. I agree to NextBlock&apos;s{' '}
                <Link href="/" style={{ color: '#1B3A6B', textDecoration: 'underline' }}>Terms of Service</Link> and{' '}
                <Link href="/" style={{ color: '#1B3A6B', textDecoration: 'underline' }}>Privacy Policy</Link>.
              </label>
            </div>

            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #1B3A6B 0%, #2D5A9E 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Submit Insurance Company Application
            </button>
          </form>
        )}

        {/* ── STEP: Syndicate Manager Form ── */}
        {step === 'form' && role === 'syndicate manager' && (
          <form onSubmit={handleCurSubmit}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <button type="button" onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontFamily: "'Inter', sans-serif", fontSize: '13px' }}>
                ← Back
              </button>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 400, color: '#0F1218', margin: 0 }}>
                Vault Syndicate Manager Application
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
                Contact & Wallet
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
              style={{
                background: 'linear-gradient(135deg, #92400E 0%, #C9A84C 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 32px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Submit Syndicate Manager Application
            </button>
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
              {role === 'insurance' ? 'insurance company' : 'syndicate manager'} application and contact you at the provided email address.
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
