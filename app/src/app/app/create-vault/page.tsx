'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ChevronRight, Shield, Info, CheckCircle2, AlertCircle, Loader2, Lock, ExternalLink } from 'lucide-react';
import { VAULT_FACTORY_ABI, CHAIN_ADDRESSES } from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';

// Off-chain KYC whitelist — addresses approved by NextBlock after KYC
// In production this would be fetched from a backend/Supabase table
const KYC_WHITELIST: string[] = [
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // demo: hardhat account 1
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // demo: hardhat account 0 (admin)
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // demo: hardhat account 2
];

// Verification type options
const VERIFICATION_TYPES = [
  { id: 'permissionless', label: 'Permissionless (On-Chain)', description: 'Claims verified automatically by smart contract logic. No trusted party required.' },
  { id: 'oracle',         label: 'Oracle Reporter',           description: 'Claims verified by a designated oracle address (e.g., Chainlink, custom reporter).' },
  { id: 'admin',          label: 'Insurer Admin',             description: 'Claims verified manually by the vault manager. Suitable for complex off-chain policies.' },
];

// Risk profile presets
const RISK_PRESETS = [
  { id: 'conservative', label: 'Conservative',  bufferBps: 3000, feeBps: 50,  apyRange: '4–8%',   description: 'High buffer (30%), low fee. Suitable for off-chain reinsurance portfolios.' },
  { id: 'balanced',     label: 'Balanced',      bufferBps: 2000, feeBps: 100, apyRange: '8–13%',  description: 'Standard buffer (20%), moderate fee. Full-spectrum diversification.' },
  { id: 'aggressive',   label: 'Aggressive',    bufferBps: 1000, feeBps: 150, apyRange: '13–18%', description: 'Low buffer (10%), higher fee. Catastrophe-focused high-yield strategies.' },
  { id: 'custom',       label: 'Custom',         bufferBps: 2000, feeBps: 100, apyRange: '',        description: 'Set your own buffer ratio and management fee.' },
];

interface FormState {
  vaultName: string;
  tokenName: string;
  tokenSymbol: string;
  bufferBps: string;
  feeBps: string;
  riskPreset: string;
  verificationTypes: string[];
  strategy: string;
  jurisdiction: string;
}

const INITIAL_FORM: FormState = {
  vaultName: '',
  tokenName: '',
  tokenSymbol: '',
  bufferBps: '2000',
  feeBps: '100',
  riskPreset: 'balanced',
  verificationTypes: ['permissionless'],
  strategy: '',
  jurisdiction: '',
};

function InputField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1B3A6B', marginBottom: '6px', letterSpacing: '0.02em' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: '11px', color: '#8A8A8A', marginTop: '4px' }}>{hint}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #E8E4DC',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#1B3A6B',
  backgroundColor: '#FFFFFF',
  outline: 'none',
  fontFamily: "'Inter', sans-serif",
  boxSizing: 'border-box',
};

export default function CreateVaultPage() {
  const { address, isConnected } = useAccount();
  const addresses = useAddresses();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  // KYC check
  const isKycApproved = isConnected && address
    ? KYC_WHITELIST.map(a => a.toLowerCase()).includes(address.toLowerCase())
    : false;

  const updateForm = useCallback((key: keyof FormState, value: string | string[]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = RISK_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setForm(prev => ({
      ...prev,
      riskPreset: presetId,
      bufferBps: preset.bufferBps.toString(),
      feeBps: preset.feeBps.toString(),
    }));
  }, []);

  const toggleVerification = useCallback((id: string) => {
    setForm(prev => {
      const current = prev.verificationTypes;
      if (current.includes(id)) {
        if (current.length === 1) return prev; // keep at least one
        return { ...prev, verificationTypes: current.filter(v => v !== id) };
      }
      return { ...prev, verificationTypes: [...current, id] };
    });
  }, []);

  const handleDeploy = useCallback(() => {
    if (!address || !addresses.vaultFactory) return;
    writeContract({
      address: addresses.vaultFactory,
      abi: VAULT_FACTORY_ABI,
      functionName: 'createVault',
      args: [
        form.tokenName,
        form.tokenSymbol,
        form.vaultName,
        address,
        BigInt(form.bufferBps),
        BigInt(form.feeBps),
      ],
    });
  }, [address, addresses.vaultFactory, form, writeContract]);

  const isStep1Valid = form.vaultName.trim() && form.tokenName.trim() && form.tokenSymbol.trim() && form.tokenSymbol.length <= 8;
  const isStep2Valid = form.verificationTypes.length > 0;

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '48px' }}>
          <Shield size={48} color="#1B3A6B" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', color: '#1B3A6B', marginBottom: '12px' }}>Connect Your Wallet</h2>
          <p style={{ fontSize: '14px', color: '#8A8A8A', lineHeight: '1.6' }}>Connect your wallet to access the vault creation interface.</p>
        </div>
      </div>
    );
  }

  // ── KYC gate ──
  if (!isKycApproved) {
    return (
      <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>
        <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 100%)', padding: '64px 40px 56px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/assets/ships-illustration.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 30%', opacity: 0.08 }} />
          <div style={{ position: 'relative', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <Link href="/app" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textDecoration: 'none' }}>Vaults</Link>
              <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>Create Vault</span>
            </div>
            <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '42px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 12px' }}>Create a Vault</h1>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '16px', margin: 0 }}>Deploy an ERC-4626 insurance vault via the NextBlock VaultFactory.</p>
          </div>
        </div>
        <div style={{ maxWidth: '640px', margin: '64px auto', padding: '0 40px' }}>
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <Lock size={28} color="#C2410C" />
            </div>
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '26px', fontWeight: 700, color: '#1B3A6B', marginBottom: '12px' }}>KYC Verification Required</h2>
            <p style={{ fontSize: '14px', color: '#5A5A5A', lineHeight: '1.7', marginBottom: '8px' }}>
              Vault creation on NextBlock is restricted to <strong>KYC-verified entities</strong> — licensed reinsurers, insurers, and asset managers who have completed the onboarding process.
            </p>
            <p style={{ fontSize: '13px', color: '#8A8A8A', marginBottom: '32px' }}>
              Connected wallet: <code style={{ backgroundColor: '#F5F5F5', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>{address?.slice(0, 6)}...{address?.slice(-4)}</code>
            </p>
            <div style={{ backgroundColor: '#FAFAF8', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '24px', marginBottom: '32px', textAlign: 'left' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B', marginBottom: '16px' }}>How to become a curator:</h3>
              {[
                { step: '01', title: 'Submit Application', desc: 'Fill out the curator application form with your entity details, regulatory status, and proposed vault strategy.' },
                { step: '02', title: 'KYC / KYB Verification', desc: 'Complete identity and business verification. NextBlock reviews your regulatory license and jurisdiction.' },
                { step: '03', title: 'Whitelist Approval', desc: 'Once approved, your wallet address is added to the curator whitelist and you gain access to vault creation.' },
                { step: '04', title: 'Deploy Your Vault', desc: 'Use this interface to deploy your ERC-4626 vault via VaultFactory with your chosen parameters.' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                  <span style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '20px', fontWeight: 700, color: '#E8E4DC', minWidth: '32px' }}>{item.step}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B', marginBottom: '2px' }}>{item.title}</div>
                    <div style={{ fontSize: '12px', color: '#8A8A8A', lineHeight: '1.5' }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <a
              href="mailto:nextblock@financier.com?subject=Curator Application"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '14px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.02em' }}
            >
              <ExternalLink size={15} />Apply for Curator Access
            </a>
            <p style={{ fontSize: '12px', color: '#8A8A8A', marginTop: '16px' }}>
              Already applied?{' '}
              <Link href="/app/curators" style={{ color: '#1B3A6B', textDecoration: 'underline' }}>View active curators</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (isConfirmed && receipt) {
    const newVaultAddress = receipt.logs?.[0]?.address ?? 'unknown';
    return (
      <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '16px', padding: '48px', maxWidth: '560px', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="#047857" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '28px', fontWeight: 700, color: '#1B3A6B', marginBottom: '12px' }}>Vault Deployed</h2>
          <p style={{ fontSize: '14px', color: '#5A5A5A', lineHeight: '1.7', marginBottom: '24px' }}>
            Your vault <strong>{form.vaultName}</strong> has been successfully deployed on-chain via the NextBlock VaultFactory.
          </p>
          <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', color: '#166534', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Vault Address</div>
            <code style={{ fontSize: '13px', color: '#166534', wordBreak: 'break-all' }}>{newVaultAddress}</code>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link href="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#1B3A6B', color: '#FFFFFF', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              View All Vaults
            </Link>
            <button onClick={() => { setForm(INITIAL_FORM); setStep(1); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F5F5F5', color: '#1B3A6B', padding: '12px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ──
  return (
    <div style={{ backgroundColor: '#FAFAF8', minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1B3A6B 0%, #0F2447 100%)', padding: '64px 40px 56px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/assets/ships-illustration.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 30%', opacity: 0.08 }} />
        <div style={{ position: 'relative', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <Link href="/app" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', textDecoration: 'none' }}>Vaults</Link>
            <ChevronRight size={12} color="rgba(255,255,255,0.3)" />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px' }}>Create Vault</span>
          </div>
          <h1 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '42px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 12px' }}>Create a Vault</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '16px', margin: 0, maxWidth: '520px' }}>
            Deploy an ERC-4626 insurance vault via the NextBlock VaultFactory. You will be set as vault manager.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E8E4DC', padding: '0 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '0' }}>
          {[{ n: 1, label: 'Vault Identity' }, { n: 2, label: 'Risk Parameters' }, { n: 3, label: 'Review & Deploy' }].map(s => (
            <button
              key={s.n}
              onClick={() => { if (s.n < step || (s.n === 2 && isStep1Valid) || (s.n === 3 && isStep1Valid && isStep2Valid)) setStep(s.n as 1|2|3); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 24px', border: 'none', borderBottom: step === s.n ? '2px solid #1B3A6B' : '2px solid transparent', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: step === s.n ? 600 : 400, color: step === s.n ? '#1B3A6B' : '#8A8A8A', transition: 'all 0.2s' }}
            >
              <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: step > s.n ? '#047857' : step === s.n ? '#1B3A6B' : '#E8E4DC', color: step >= s.n ? '#FFFFFF' : '#8A8A8A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                {step > s.n ? '✓' : s.n}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form body */}
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '48px 40px' }}>

        {/* ── Step 1: Vault Identity ── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', fontWeight: 700, color: '#1B3A6B', marginBottom: '8px' }}>Vault Identity</h2>
            <p style={{ fontSize: '14px', color: '#8A8A8A', marginBottom: '32px' }}>Define the name, token symbol, and strategy description for your vault.</p>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px' }}>
              <InputField label="Vault Name" hint="The human-readable name shown in the NextBlock interface (e.g. 'Balanced Core')">
                <input
                  type="text"
                  value={form.vaultName}
                  onChange={e => updateForm('vaultName', e.target.value)}
                  placeholder="e.g. Balanced Core"
                  style={inputStyle}
                />
              </InputField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <InputField label="ERC-20 Token Name" hint="Full name of the vault share token">
                  <input
                    type="text"
                    value={form.tokenName}
                    onChange={e => updateForm('tokenName', e.target.value)}
                    placeholder="e.g. NextBlock Balanced Core"
                    style={inputStyle}
                  />
                </InputField>
                <InputField label="Token Symbol" hint="Max 8 characters (e.g. nbBAL)">
                  <input
                    type="text"
                    value={form.tokenSymbol}
                    onChange={e => updateForm('tokenSymbol', e.target.value.toUpperCase().slice(0, 8))}
                    placeholder="e.g. nbBAL"
                    style={inputStyle}
                  />
                </InputField>
              </div>

              <InputField label="Strategy Description" hint="Describe the insurance strategy and risk profile of this vault">
                <textarea
                  value={form.strategy}
                  onChange={e => updateForm('strategy', e.target.value)}
                  placeholder="e.g. Full-spectrum diversification across parametric, catastrophe, and traditional reinsurance policies..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </InputField>

              <InputField label="Jurisdiction" hint="Your entity's regulatory jurisdiction">
                <input
                  type="text"
                  value={form.jurisdiction}
                  onChange={e => updateForm('jurisdiction', e.target.value)}
                  placeholder="e.g. Saint Kitts & Nevis, Bermuda, Cayman Islands..."
                  style={inputStyle}
                />
              </InputField>

              {/* Vault manager (read-only) */}
              <div style={{ backgroundColor: '#FAFAF8', border: '1px solid #E8E4DC', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>Vault Manager (you)</div>
                  <code style={{ fontSize: '13px', color: '#1B3A6B' }}>{address}</code>
                </div>
                <span style={{ backgroundColor: '#F0FDF4', color: '#166534', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>✓ KYC Verified</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => setStep(2)}
                disabled={!isStep1Valid}
                style={{ backgroundColor: isStep1Valid ? '#1B3A6B' : '#E8E4DC', color: isStep1Valid ? '#FFFFFF' : '#8A8A8A', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: isStep1Valid ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
              >
                Continue to Risk Parameters →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Risk Parameters ── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', fontWeight: 700, color: '#1B3A6B', marginBottom: '8px' }}>Risk Parameters</h2>
            <p style={{ fontSize: '14px', color: '#8A8A8A', marginBottom: '32px' }}>Configure the buffer ratio, management fee, and supported claim verification paths.</p>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B', marginBottom: '16px' }}>Risk Profile Preset</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {RISK_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    style={{ padding: '16px', border: `2px solid ${form.riskPreset === preset.id ? '#1B3A6B' : '#E8E4DC'}`, borderRadius: '10px', backgroundColor: form.riskPreset === preset.id ? '#EFF6FF' : '#FFFFFF', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B' }}>{preset.label}</span>
                      {preset.apyRange && <span style={{ fontSize: '11px', fontWeight: 700, color: '#047857', backgroundColor: '#F0FDF4', padding: '2px 6px', borderRadius: '4px' }}>{preset.apyRange}</span>}
                    </div>
                    <p style={{ fontSize: '12px', color: '#8A8A8A', margin: 0, lineHeight: '1.5' }}>{preset.description}</p>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <InputField label="Buffer Ratio (bps)" hint="Liquidity buffer as basis points. 2000 = 20% of TVL reserved for claims.">
                  <input
                    type="number"
                    value={form.bufferBps}
                    onChange={e => { updateForm('bufferBps', e.target.value); updateForm('riskPreset', 'custom'); }}
                    min="100" max="5000" step="100"
                    style={inputStyle}
                  />
                </InputField>
                <InputField label="Management Fee (bps)" hint="Annual management fee in basis points. 100 = 1% per year.">
                  <input
                    type="number"
                    value={form.feeBps}
                    onChange={e => { updateForm('feeBps', e.target.value); updateForm('riskPreset', 'custom'); }}
                    min="0" max="500" step="10"
                    style={inputStyle}
                  />
                </InputField>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B', marginBottom: '8px' }}>Claim Verification Paths</h3>
              <p style={{ fontSize: '13px', color: '#8A8A8A', marginBottom: '20px' }}>Select which claim verification methods your vault will support. At least one is required.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {VERIFICATION_TYPES.map(vt => (
                  <button
                    key={vt.id}
                    onClick={() => toggleVerification(vt.id)}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px', border: `2px solid ${form.verificationTypes.includes(vt.id) ? '#1B3A6B' : '#E8E4DC'}`, borderRadius: '10px', backgroundColor: form.verificationTypes.includes(vt.id) ? '#EFF6FF' : '#FFFFFF', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                  >
                    <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${form.verificationTypes.includes(vt.id) ? '#1B3A6B' : '#D1D5DB'}`, backgroundColor: form.verificationTypes.includes(vt.id) ? '#1B3A6B' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                      {form.verificationTypes.includes(vt.id) && <span style={{ color: '#FFFFFF', fontSize: '12px', fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B3A6B', marginBottom: '2px' }}>{vt.label}</div>
                      <div style={{ fontSize: '12px', color: '#8A8A8A', lineHeight: '1.5' }}>{vt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button onClick={() => setStep(1)} style={{ backgroundColor: '#F5F5F5', color: '#1B3A6B', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!isStep2Valid}
                style={{ backgroundColor: isStep2Valid ? '#1B3A6B' : '#E8E4DC', color: isStep2Valid ? '#FFFFFF' : '#8A8A8A', padding: '12px 32px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: isStep2Valid ? 'pointer' : 'not-allowed' }}
              >
                Review & Deploy →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Review & Deploy ── */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '24px', fontWeight: 700, color: '#1B3A6B', marginBottom: '8px' }}>Review & Deploy</h2>
            <p style={{ fontSize: '14px', color: '#8A8A8A', marginBottom: '32px' }}>Review your vault configuration before submitting the on-chain transaction.</p>

            {/* Summary card */}
            <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '12px', padding: '32px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: '22px', fontWeight: 700, color: '#1B3A6B', margin: 0 }}>{form.vaultName}</h3>
                <span style={{ backgroundColor: '#F5F0E8', color: '#6B5B3E', fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px' }}>ERC-4626 Vault</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: 'Token Name', value: form.tokenName },
                  { label: 'Token Symbol', value: form.tokenSymbol },
                  { label: 'Buffer Ratio', value: `${(parseInt(form.bufferBps) / 100).toFixed(0)}% (${form.bufferBps} bps)` },
                  { label: 'Management Fee', value: `${(parseInt(form.feeBps) / 100).toFixed(2)}% / year (${form.feeBps} bps)` },
                  { label: 'Jurisdiction', value: form.jurisdiction || '—' },
                  { label: 'Vault Manager', value: `${address?.slice(0, 6)}...${address?.slice(-4)}` },
                ].map(item => (
                  <div key={item.label} style={{ padding: '12px 16px', backgroundColor: '#FAFAF8', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1B3A6B' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '16px', backgroundColor: '#FAFAF8', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>Claim Verification Paths</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {form.verificationTypes.map(v => (
                    <span key={v} style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                      {VERIFICATION_TYPES.find(vt => vt.id === v)?.label}
                    </span>
                  ))}
                </div>
              </div>

              {form.strategy && (
                <div style={{ padding: '16px', backgroundColor: '#FAFAF8', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' }}>Strategy</div>
                  <p style={{ fontSize: '13px', color: '#5A5A5A', margin: 0, lineHeight: '1.6' }}>{form.strategy}</p>
                </div>
              )}
            </div>

            {/* Contract info */}
            <div style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
              <Info size={16} color="#1D4ED8" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div style={{ fontSize: '13px', color: '#1D4ED8', lineHeight: '1.6' }}>
                This will call <code style={{ backgroundColor: 'rgba(29,78,216,0.1)', padding: '1px 5px', borderRadius: '3px' }}>VaultFactory.createVault()</code> on{' '}
                <strong>Base Sepolia</strong>. The transaction will deploy a new ERC-4626 insurance vault and register it in the protocol. Gas fees apply.
              </div>
            </div>

            {/* Error */}
            {writeError && (
              <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '12px' }}>
                <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '13px', color: '#DC2626' }}>{writeError.message}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setStep(2)} style={{ backgroundColor: '#F5F5F5', color: '#1B3A6B', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                ← Back
              </button>
              <button
                onClick={handleDeploy}
                disabled={isPending || isConfirming}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: isPending || isConfirming ? '#6B7280' : '#1B3A6B', color: '#FFFFFF', padding: '14px 36px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: isPending || isConfirming ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
              >
                {isPending ? <><Loader2 size={16} className="animate-spin" />Confirm in Wallet...</> :
                 isConfirming ? <><Loader2 size={16} className="animate-spin" />Deploying Vault...</> :
                 <><Shield size={16} />Deploy Vault</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
