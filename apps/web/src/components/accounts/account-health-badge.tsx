import clsx from 'clsx';

interface AccountHealthBadgeProps {
  status: 'healthy' | 'needs_attention' | 'at_risk';
  className?: string;
}

const statusConfig = {
  healthy: {
    label: 'Healthy',
    className: 'bg-green-100 text-[#22a06b] dark:bg-green-900/30 dark:text-[#22c380] dark:glow-healthy',
  },
  needs_attention: {
    label: 'Needs Attention',
    className: 'bg-yellow-100 text-[#da8e0b] dark:bg-yellow-900/30 dark:text-[#f9a91f] dark:glow-warning',
  },
  at_risk: {
    label: 'At Risk',
    className: 'bg-red-100 text-[#df2020] dark:bg-red-900/30 dark:text-[#f04242] dark:glow-critical',
  },
};

export default function AccountHealthBadge({ status, className }: AccountHealthBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.healthy;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
