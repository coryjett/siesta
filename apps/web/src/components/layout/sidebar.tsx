import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { useAuth } from '../../contexts/auth-context';
import Badge from '../common/badge';
import { useUpcomingMeetings, type CalendarEvent } from '../../api/queries/calendar';

const STORAGE_KEY = 'siesta:sidebar-collapsed';

interface NavItem {
  label: string;
  to: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: 'H' },
  { label: 'Opportunities', to: '/opportunities/kanban', icon: 'O' },
  { label: 'Accounts', to: '/accounts', icon: 'A' },
  { label: 'Gong Search', to: '/gong/search', icon: 'G' },
];

const roleLabels: Record<string, string> = {
  se: 'SE',
  se_manager: 'Manager',
  admin: 'Admin',
};

function NavIcon({ letter }: { letter: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
      {letter}
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 0) {
    const absDiff = Math.abs(diffMin);
    if (absDiff < 60) return `${absDiff}m ago`;
    return `${Math.round(absDiff / 60)}h ago`;
  }
  if (diffMin < 60) return `in ${diffMin}m`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function MeetingItem({ event }: { event: CalendarEvent }) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {formatTime(event.start)}
        </span>
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          {formatRelativeTime(event.start)}
        </span>
      </div>
      <p className="mt-0.5 truncate text-sm text-gray-700 dark:text-gray-300" title={event.summary}>
        {event.summary}
      </p>
      {event.meetLink && (
        <a
          href={event.meetLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Join meeting
        </a>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { user, isAuthenticated } = useAuth();
  const { data: meetings } = useUpcomingMeetings();
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
        'flex h-screen flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 dark:border-gray-700 px-5">
        {collapsed ? (
          <span className="text-xl font-bold text-indigo-600">S</span>
        ) : (
          <span className="text-xl font-bold text-indigo-600">Siesta</span>
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
                  'flex items-center rounded-lg py-2 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700',
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                )}
                activeProps={{
                  className: clsx(
                    'flex items-center rounded-lg py-2 text-sm font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400',
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

      {/* Upcoming Meetings */}
      {isAuthenticated && !collapsed && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Upcoming Meetings
          </h3>
          {(!meetings || meetings.length === 0) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No upcoming meetings</p>
          ) : (
            <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
              {meetings.slice(0, 5).map((event) => (
                <MeetingItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* User section */}
      {user && !collapsed && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {user.name}
              </p>
              <Badge variant="info" className="mt-0.5">
                {roleLabels[user.role] ?? user.role}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className={clsx('border-t border-gray-200 dark:border-gray-700 p-2', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
