'use client';

import { useState } from 'react';
import {
  POLICY_TYPES,
  PREMIUM_BANDS,
  type PolicyType,
  type PremiumBand,
} from '@/lib/cedant/schema';
import { KYB_CHAIN_ID } from '@/lib/kyb/schema';

interface Props {
  walletAddress: `0x${string}`;
  onSubmitted: (applicationId: string) => void;
}

/**
 * Cedant intake form — merges the generic KYB fields with the
 * cedant-specific underwriting metadata. Server-side this lands as a single
 * atomic insert via /api/cedant/intake (KYB row + cedant_profiles row);
 * a failed profile insert rolls back the KYB row.
 */
export function CedantIntakeForm({ walletAddress, onSubmitted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // KYB fields
  const [companyName, setCompanyName] = useState('');
  const [legalEntityType, setLegalEntityType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');

  // Cedant profile fields
  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([]);
  const [geoScopeRaw, setGeoScopeRaw] = useState(''); // comma-separated ISO codes
  const [annualPremiumBand, setAnnualPremiumBand] = useState<PremiumBand | ''>('');
  const [expectedCapacity, setExpectedCapacity] = useState<string>('');
  const [notes, setNotes] = useState('');

  const togglePolicy = (t: PolicyType) =>
    setPolicyTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function submit() {
    setError(null);
    if (policyTypes.length === 0) {
      setError('Select at least one policy type.');
      return;
    }
    if (!annualPremiumBand) {
      setError('Select an annual premium band.');
      return;
    }
    const geoScope = geoScopeRaw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length >= 2 && s.length <= 6);
    if (geoScope.length === 0) {
      setError('Enter at least one geo code (e.g. IT, DE, US).');
      return;
    }
    const capacityNum = expectedCapacity.trim() ? Number(expectedCapacity) : undefined;
    if (capacityNum !== undefined && (!Number.isFinite(capacityNum) || capacityNum <= 0)) {
      setError('Expected capacity must be a positive number.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/cedant/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kyb: {
            applicantType: 'cedant',
            walletAddress,
            companyName,
            legalEntityType,
            jurisdiction,
            licenseNumber: licenseNumber || undefined,
            declaredPortfolio: undefined,
            contactName,
            contactEmail,
            website: website || undefined,
            description: description || undefined,
            chainId: KYB_CHAIN_ID,
          },
          profile: {
            policyTypes,
            geoScope,
            annualPremiumBand,
            expectedCededCapacityUsdc: capacityNum,
            notes: notes || undefined,
          },
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
        setError(j.error ?? `HTTP ${res.status}` + (j.issues ? `: ${j.issues.join(', ')}` : ''));
        return;
      }
      const j = (await res.json()) as { id: string };
      onSubmitted(j.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <FieldGroup title="Legal entity">
        <Field label="Company name" required>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Legal entity type" required>
          <input
            value={legalEntityType}
            onChange={(e) => setLegalEntityType(e.target.value)}
            placeholder="e.g. SpA, AG, Ltd, Insurance Company"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Jurisdiction" required>
          <input
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            placeholder="e.g. Italy, Switzerland, Bermuda"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Regulatory license #">
          <input
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
      </FieldGroup>

      <FieldGroup title="Underwriting profile">
        <Field label="Lines of business" required>
          <div className="flex flex-wrap gap-2">
            {POLICY_TYPES.map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs ${
                  policyTypes.includes(t)
                    ? 'bg-violet-600 text-white'
                    : 'border border-gray-200 text-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={policyTypes.includes(t)}
                  onChange={() => togglePolicy(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Geographic scope (ISO codes, comma-separated)" required>
          <input
            value={geoScopeRaw}
            onChange={(e) => setGeoScopeRaw(e.target.value)}
            placeholder="IT, DE, FR"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Annual ceded premium band (USDC)" required>
          <select
            value={annualPremiumBand}
            onChange={(e) => setAnnualPremiumBand(e.target.value as PremiumBand)}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          >
            <option value="">Select…</option>
            {PREMIUM_BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected vault capacity request (USDC)">
          <input
            type="number"
            min="0"
            value={expectedCapacity}
            onChange={(e) => setExpectedCapacity(e.target.value)}
            placeholder="e.g. 25000000"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
      </FieldGroup>

      <FieldGroup title="Contact">
        <Field label="Contact name" required>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Contact email" required>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Website">
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Notes for the Curator">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm"
          />
        </Field>
      </FieldGroup>

      <Field label="Wallet">
        <code className="text-xs text-gray-500">{walletAddress}</code>
      </Field>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-1 font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </div>
      {children}
    </label>
  );
}
