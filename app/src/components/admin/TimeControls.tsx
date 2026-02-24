'use client';

import { useCurrentTime, useTimeOffset } from '@/hooks/usePolicyRegistry';
import { useAdvanceTime } from '@/hooks/useTimeControls';
import { SECONDS_PER_DAY } from '@/config/constants';
import { useState } from 'react';

export function TimeControls() {
  const { data: currentTime } = useCurrentTime();
  const { data: timeOffset } = useTimeOffset();
  const { advanceTime, isPending } = useAdvanceTime();
  const [customDays, setCustomDays] = useState('');

  const currentDate = currentTime
    ? new Date(Number(currentTime) * 1000).toLocaleString()
    : '--';

  const offsetDays = timeOffset
    ? Math.floor(Number(timeOffset) / SECONDS_PER_DAY)
    : 0;

  const handleAdvance = (days: number) => {
    advanceTime(BigInt(days * SECONDS_PER_DAY));
  };

  const handleCustomAdvance = () => {
    const days = parseInt(customDays);
    if (days > 0) {
      advanceTime(BigInt(days * SECONDS_PER_DAY));
      setCustomDays('');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">
        Time Controls
      </h3>
      <p className="mb-4 text-xs text-gray-500">
        Advance virtual time to simulate premium accrual and policy expiry.
      </p>

      {/* Current time display */}
      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Virtual Time</span>
          <span className="font-mono-num text-sm font-medium text-gray-900">
            {currentDate}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">Time Offset</span>
          <span className="font-mono-num text-xs text-gray-600">
            +{offsetDays} days
          </span>
        </div>
      </div>

      {/* Quick buttons */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => handleAdvance(1)}
          disabled={isPending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          +1 Day
        </button>
        <button
          type="button"
          onClick={() => handleAdvance(7)}
          disabled={isPending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          +7 Days
        </button>
        <button
          type="button"
          onClick={() => handleAdvance(30)}
          disabled={isPending}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          +30 Days
        </button>
      </div>

      {/* Custom input */}
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Custom days"
          value={customDays}
          onChange={(e) => setCustomDays(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:border-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleCustomAdvance}
          disabled={isPending || !customDays || parseInt(customDays) <= 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {isPending ? '...' : 'Advance'}
        </button>
      </div>
    </div>
  );
}
