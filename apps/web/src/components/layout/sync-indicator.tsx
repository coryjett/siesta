import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useSyncStatus } from '../../hooks/use-sync-status';
import type { ProviderSyncStatus } from '../../hooks/use-sync-status';

const statusColor: Record<string, string> = {
  healthy: 'bg-green-500',
  running: 'bg-yellow-500',
  failed: 'bg-red-500',
  idle: 'bg-gray-400',
};

const statusLabel: Record<string, string> = {
  healthy: 'Healthy',
  running: 'Running',
  failed: 'Failed',
  idle: 'Idle',
};

function ProviderRow({ provider }: { provider: ProviderSyncStatus }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={clsx('h-2 w-2 rounded-full', statusColor[provider.status])}
        />
        <span className="capitalize text-gray-700 dark:text-gray-300">{provider.provider}</span>
      </div>
      <span className="text-gray-500 text-xs">
        {statusLabel[provider.status]}
      </span>
    </div>
  );
}

export default function SyncIndicator() {
  const { data, isError } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const overall = isError ? 'failed' : (data?.overall ?? 'idle');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        type="button"
      >
        <span
          className={clsx(
            'h-2.5 w-2.5 rounded-full',
            statusColor[overall],
          )}
        />
        <span>Sync</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg z-50">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Sync Status
          </h4>
          {data?.providers && data.providers.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.providers.map((p) => (
                <ProviderRow key={p.provider} provider={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No sync providers configured.</p>
          )}
        </div>
      )}
    </div>
  );
}
