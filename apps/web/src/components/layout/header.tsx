import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../../contexts/auth-context';
import { useTheme } from '../../contexts/theme-context';
import { useAlerts } from '../../hooks/use-alerts';
import GlobalSearch from './global-search';

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const alertsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { alerts } = useAlerts();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
  };

  const hasCritical = alerts.some((a) => a.severity === 'critical');

  return (
    <header className="flex h-16 items-center justify-between border-b border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-4 md:px-6">
      <div className="flex items-center gap-2 shrink-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden flex items-center justify-center rounded-lg p-1.5 text-[#6b677e] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <h1 className="font-display text-lg font-semibold text-[#191726] dark:text-[#f2f2f2] hidden sm:block">{title}</h1>
      </div>

      <div className="mx-4 flex-1 flex items-center justify-center gap-3">
        {/* Needs Attention */}
        {alerts.length > 0 && (
          <div className="relative" ref={alertsRef}>
            <button
              type="button"
              onClick={() => setAlertsOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                hasCritical
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 animate-pulse-subtle'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="hidden sm:inline">Needs Attention</span>
              <span className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                hasCritical
                  ? 'bg-red-600 text-white'
                  : 'bg-yellow-600 text-white'
              }`}>
                {alerts.length}
              </span>
            </button>

            {alertsOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] shadow-lg z-50 overflow-hidden">
                <div className="border-b border-[#dedde4] dark:border-[#2a2734] px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198]">
                    Needs Attention ({alerts.length})
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
                  {alerts.map((alert) => (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => {
                        setAlertsOpen(false);
                        navigate({ to: '/accounts/$accountId', params: { accountId: alert.accountId } });
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f6f5f9] dark:hover:bg-[#1a1825] transition-colors cursor-pointer"
                    >
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        alert.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] truncate">
                            {alert.accountName}
                          </span>
                          <span className={`shrink-0 text-[10px] font-semibold ${
                            alert.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'
                          }`}>
                            {alert.title}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198] truncate">
                          {alert.detail}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="relative inline-flex h-7 w-13 items-center rounded-full bg-[#e9e8ed] dark:bg-[#25232f] transition-colors"
          aria-label="Toggle dark mode"
          type="button"
        >
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
              resolvedTheme === 'dark' ? 'translate-x-6.5' : 'translate-x-1'
            }`}
          >
            {resolvedTheme === 'dark' ? (
              <svg className="h-3 w-3 text-[#858198]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            ) : (
              <svg className="h-3 w-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            )}
          </span>
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
            type="button"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6b26d9]/10 text-xs font-medium text-[#6b26d9] dark:bg-[#8249df]/20 dark:text-[#8249df]">
                {user?.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) ?? '?'}
              </span>
            )}
            <span className="hidden sm:inline">{user?.name ?? 'User'}</span>
            <svg
              className="h-4 w-4 text-[#6b677e]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] py-1 shadow-lg z-50">
              <div className="border-b border-[#dedde4] dark:border-[#2a2734] px-4 py-2">
                <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">{user?.name}</p>
                <p className="text-xs text-[#6b677e] dark:text-[#858198]">{user?.email}</p>
              </div>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#191726] dark:text-[#f2f2f2] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
              >
                <svg
                  className="h-4 w-4 text-[#6b677e]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#191726] dark:text-[#f2f2f2] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
                type="button"
              >
                <svg
                  className="h-4 w-4 text-[#6b677e]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
