import { ClaimsControlRoom } from '@/components/claims/ClaimsControlRoom';
import { ClaimLifecyclePanel } from '@/components/claims/ClaimLifecyclePanel';

export default function ClaimsPage() {
  return (
    <div data-track-section="claims_room" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Claims</h1>
      <p className="mb-6 text-sm text-gray-500">
        Institutional claims control room — queue, filters, SLA age and per-claim decision timeline,
        read live from the on-chain model. Lifecycle actions (submit, assess, dispute, approve, pay)
        are role-gated in the panel below.
      </p>
      <div className="space-y-6">
        <ClaimsControlRoom />
        <ClaimLifecyclePanel />
      </div>
    </div>
  );
}
