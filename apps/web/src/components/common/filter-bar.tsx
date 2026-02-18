import type { ReactNode } from 'react';
import clsx from 'clsx';

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

export default function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
