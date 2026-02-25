import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}

export default function Card({
  title,
  headerRight,
  children,
  className,
  dragHandleProps,
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white dark:bg-[#14131b] rounded-xl shadow-sm border border-[#dedde4] dark:border-[#2a2734] p-6',
        className,
      )}
    >
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {dragHandleProps && (
            <button
              type="button"
              className="cursor-grab touch-none rounded-xl p-1 text-[#6b677e] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] hover:text-[#191726] dark:hover:text-[#f2f2f2] active:cursor-grabbing"
              aria-label="Drag to reorder"
              {...dragHandleProps}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </button>
          )}
          <h3 className="font-display text-lg font-semibold text-[#191726] dark:text-[#f2f2f2]">{title}</h3>
          {headerRight && <div className="ml-auto">{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
