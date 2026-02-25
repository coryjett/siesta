import clsx from 'clsx';
import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[#e9e8ed] text-[#6b677e] dark:bg-[#25232f] dark:text-[#858198]',
  success: 'bg-green-100 text-[#22a06b] dark:bg-green-900/30 dark:text-[#22c380] dark:glow-healthy',
  warning: 'bg-yellow-100 text-[#da8e0b] dark:bg-yellow-900/30 dark:text-[#f9a91f] dark:glow-warning',
  danger: 'bg-red-100 text-[#df2020] dark:bg-red-900/30 dark:text-[#f04242] dark:glow-critical',
  info: 'bg-[#6b26d9]/10 text-[#6b26d9] dark:bg-[#8249df]/20 dark:text-[#8249df]',
};

export default function Badge({
  variant = 'default',
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
