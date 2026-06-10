'use client';

import { formatUSDCRaw } from '@/lib/formatting';

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  maxAmount: bigint;
  maxLabel: string;
  disabled?: boolean;
}

export function AmountInput({
  value,
  onChange,
  maxAmount,
  maxLabel,
  disabled = false,
}: AmountInputProps) {
  const handleMax = () => {
    const formatted = formatUSDCRaw(maxAmount);
    onChange(formatted.replace(/,/g, ''));
  };

  return (
    <div>
      <div className="relative rounded-lg border border-gray-200 bg-gray-50 transition-colors focus-within:border-gray-400 focus-within:bg-white">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => {
            // Allow only numbers and a single decimal point
            const cleaned = e.target.value.replace(/[^0-9.]/g, '');
            const parts = cleaned.split('.');
            if (parts.length > 2) return;
            if (parts[1] && parts[1].length > 6) return;
            onChange(cleaned);
          }}
          disabled={disabled}
          className="font-mono-num w-full rounded-lg bg-transparent px-4 py-3 text-lg font-semibold text-gray-900 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <span className="text-sm font-medium text-gray-400">USDC</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-gray-400">{maxLabel}</span>
        <button
          type="button"
          onClick={handleMax}
          disabled={disabled || maxAmount <= 0n}
          className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 disabled:text-gray-300"
        >
          {formatUSDCRaw(maxAmount)} MAX
        </button>
      </div>
    </div>
  );
}
