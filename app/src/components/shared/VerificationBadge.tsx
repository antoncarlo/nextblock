'use client';

import { VerificationType, VERIFICATION_CONFIG } from '@/config/constants';

interface VerificationBadgeProps {
  type: VerificationType | number;
  size?: 'sm' | 'md';
}

export function VerificationBadge({ type, size = 'sm' }: VerificationBadgeProps) {
  const config = VERIFICATION_CONFIG[type as VerificationType] ?? VERIFICATION_CONFIG[VerificationType.ON_CHAIN];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${config.bgColor} ${config.borderColor} ${config.color} ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
      } font-medium`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </span>
  );
}

/**
 * Compact dot-only version for vault cards.
 */
export function VerificationDot({ type }: { type: VerificationType | number }) {
  const config = VERIFICATION_CONFIG[type as VerificationType] ?? VERIFICATION_CONFIG[VerificationType.ON_CHAIN];

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${config.dotColor}`}
      title={config.label}
    />
  );
}
