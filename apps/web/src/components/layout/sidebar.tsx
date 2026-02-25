import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { useAuth } from '../../contexts/auth-context';
import Badge from '../common/badge';

const STORAGE_KEY = 'siesta:sidebar-collapsed';

interface NavItem {
  label: string;
  to: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: 'H' },
  { label: 'Accounts', to: '/accounts', icon: 'A' },
  { label: 'Search', to: '/search', icon: 'S' },
];

const roleLabels: Record<string, string> = {
  se: 'SE',
  se_manager: 'Manager',
  admin: 'Admin',
};

function NavIcon({ letter }: { letter: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-sm font-semibold text-[#6b26d9] dark:text-[#8249df]">
      {letter}
    </span>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }

  return (
    <aside
      className={clsx(
        'flex h-screen flex-col border-r border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#0d0c12] transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-[#dedde4] dark:border-[#2a2734] px-5">
        {collapsed ? (
          <span className="font-display text-xl font-bold text-[#6b26d9] dark:text-[#8249df]">S</span>
        ) : (
          <span className="font-display text-xl font-bold text-[#6b26d9] dark:text-[#8249df]">Siesta</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className={clsx(
                  'flex items-center rounded-xl py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]',
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                )}
                activeProps={{
                  className: clsx(
                    'flex items-center rounded-xl py-2 text-sm font-medium bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df]',
                    collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                  ),
                }}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon letter={item.icon} />
                {!collapsed && item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* User section */}
      {user && !collapsed && (
        <Link
          to="/settings"
          className="block border-t border-[#dedde4] dark:border-[#2a2734] p-4 transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
        >
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-sm font-medium text-[#6b26d9] dark:text-[#8249df]">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
                {user.name}
              </p>
              <Badge variant="info" className="mt-0.5">
                {roleLabels[user.role] ?? user.role}
              </Badge>
            </div>
          </div>
        </Link>
      )}

      {/* Collapse toggle */}
      <div className={clsx('border-t border-[#dedde4] dark:border-[#2a2734] p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-center rounded-xl p-2 text-[#6b677e] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx('transition-transform', collapsed && 'rotate-180')}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
