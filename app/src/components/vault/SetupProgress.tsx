'use client';

import type { SetupStep, StepId } from '@/lib/vault-setup';

/**
 * The four setup actions as one procedure rather than four peers.
 *
 * The page used to present them as equal tabs, so nothing indicated that they
 * run in order, that step 4 has two preconditions, or which of them was
 * missing. A curator could press "Deposit premium" first and receive a revert
 * the wallet renders as a gas-limit message — which says nothing about the
 * policy not being in the vault.
 *
 * A blocked step stays visible and stays clickable: hiding it would leave the
 * curator wondering where it went, and the reason it is blocked is the most
 * useful thing on the screen.
 */
export function SetupProgress({
  steps,
  active,
  onSelect,
}: {
  steps: SetupStep[];
  active: StepId;
  onSelect: (id: StepId) => void;
}) {
  return (
    <ol
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 8,
        listStyle: 'none',
        padding: 0,
        margin: '0 0 20px',
      }}
    >
      {steps.map((step) => {
        const isActive = step.id === active;
        const blocked = Boolean(step.blockedReason) && !step.done;

        const border = step.done
          ? 'rgba(4,120,87,0.35)'
          : blocked
            ? 'rgba(180,83,9,0.35)'
            : isActive
              ? '#1B3A6B'
              : 'rgba(0,0,0,0.10)';

        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={isActive ? 'step' : undefined}
              style={{
                width: '100%',
                height: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 12,
                border: `1px solid ${border}`,
                background: isActive ? 'rgba(27,58,107,0.04)' : '#fff',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: step.done ? '#D1FAE5' : blocked ? '#FEF3C7' : isActive ? '#1B3A6B' : '#F3F4F6',
                    color: step.done ? '#047857' : blocked ? '#92400E' : isActive ? '#fff' : '#9CA3AF',
                  }}
                >
                  {step.done ? '✓' : step.n}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F1218' }}>{step.label}</span>
              </span>

              <span style={{ fontSize: 11, lineHeight: 1.5, color: blocked ? '#92400E' : '#6B7280' }}>
                {blocked ? step.blockedReason : step.done ? 'Done' : step.description}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
