import clsx from 'clsx';
import { formatCurrency } from '../../lib/currency';

interface HealthCardProps {
  title: string;
  count: number;
  arr: number;
  variant: 'healthy' | 'needs_attention' | 'at_risk';
  onClick?: () => void;
}

const variantStyles = {
  healthy: {
    border: 'border-green-200 dark:border-green-800',
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-[#22a06b] dark:text-[#22c380]',
    count: 'text-green-900 dark:text-green-200',
    glow: 'dark:glow-healthy',
  },
  needs_attention: {
    border: 'border-yellow-200 dark:border-yellow-800',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    text: 'text-[#da8e0b] dark:text-[#f9a91f]',
    count: 'text-yellow-900 dark:text-yellow-200',
    glow: 'dark:glow-warning',
  },
  at_risk: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-[#df2020] dark:text-[#f04242]',
    count: 'text-red-900 dark:text-red-200',
    glow: 'dark:glow-critical',
  },
};

export default function HealthCard({ title, count, arr, variant, onClick }: HealthCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={clsx(
        'rounded-xl border p-6 transition-colors',
        styles.border,
        styles.bg,
        styles.glow,
        onClick && 'cursor-pointer hover:shadow-md',
      )}
      onClick={onClick}
    >
      <p className={clsx('text-sm font-medium', styles.text)}>{title}</p>
      <p className={clsx('mt-2 text-3xl font-bold font-display', styles.count)}>{count}</p>
      <p className={clsx('mt-1 text-sm', styles.text)}>
        {formatCurrency(arr)} ARR
      </p>
    </div>
  );
}
