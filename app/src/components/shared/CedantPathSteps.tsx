/**
 * Reinsurer (cedant) onboarding path — the same 4-step strip on every surface
 * of the journey, so a cedant always knows where they are and what comes next.
 * Steps: 1 KYB application (/app/apply) → 2 company profile
 * (/app/cedant/onboard) → 3 submit portfolio (/app/my-company) → 4 pay ceded
 * premium (cedant dashboard). Pure presentational; the pages decide `active`.
 */

const STEPS: { n: 1 | 2 | 3 | 4; label: string; href: string }[] = [
  { n: 1, label: 'KYB application', href: '/app/apply' },
  { n: 2, label: 'Company profile', href: '/app/cedant/onboard' },
  { n: 3, label: 'Submit portfolio', href: '/app/my-company' },
  { n: 4, label: 'Pay ceded premium', href: '/app/cedant/dashboard' },
];

export function CedantPathSteps({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <span key={s.n} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-400">→</span>}
          {s.n === active ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-900">
              {s.n} · {s.label} (you are here)
            </span>
          ) : (
            <a href={s.href} className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 hover:bg-gray-200">
              {s.n} · {s.label}
            </a>
          )}
        </span>
      ))}
    </div>
  );
}
