import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useAuth } from '../../contexts/auth-context';
import { useUpcomingMeetings } from '../../api/queries/home';
import Badge from '../common/badge';
import { Spinner } from '../common/loading';

const STORAGE_KEY = 'siesta:sidebar-collapsed';

interface NavItem {
  label: string;
  to: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Home', to: '/', icon: 'H' },
  { label: 'Accounts', to: '/accounts', icon: 'A' },
  { label: 'Contacts', to: '/contacts', icon: 'C' },
  { label: 'Action Items', to: '/action-items', icon: 'I' },
  { label: 'Opportunities', to: '/opportunities', icon: 'O' },
  { label: 'Insights', to: '/insights', icon: 'N' },
  { label: 'Tools', to: '/tools', icon: 'T' },
  { label: 'Resources', to: '/resources', icon: 'R' },
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

function formatMeetingDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const meetingDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (meetingDay.getTime() === today.getTime()) {
    return `Today ${time}`;
  }
  if (meetingDay.getTime() === tomorrow.getTime()) {
    return `Tomorrow ${time}`;
  }

  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${dayName} ${time}`;
}

function UpcomingMeetingsSection() {
  const navigate = useNavigate();
  const { data, isLoading } = useUpcomingMeetings();
  const meetings = (data?.meetings ?? []).slice(0, 5);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-[#6b677e] dark:text-[#858198]">
        No upcoming meetings
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {meetings.map((meeting) => (
        <li key={`${meeting.accountId}-${meeting.id}`}>
          <div className="group rounded-lg px-3 py-2 transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]">
            <p className="truncate text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">
              {meeting.title}
            </p>
            <p className="text-xs text-[#6b677e] dark:text-[#858198]">
              {formatMeetingDate(meeting.date)}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <p className="truncate text-xs text-[#6b677e] dark:text-[#858198]">
                {meeting.accountName}
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: '/meetings/brief/$accountId',
                    params: { accountId: meeting.accountId },
                    search: { title: meeting.title, date: meeting.date },
                  } as never)
                }
                className="shrink-0 rounded-md bg-[#6b26d9]/10 dark:bg-[#8249df]/20 px-2 py-0.5 text-xs font-medium text-[#6b26d9] dark:text-[#8249df] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#6b26d9]/20 dark:hover:bg-[#8249df]/30"
              >
                Brief
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CalendarIcon() {
  return (
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
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const { data: meetingsData } = useUpcomingMeetings();
  const meetingCount = meetingsData?.meetings?.length ?? 0;
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
        'w-60 md:w-auto',
        collapsed ? 'md:w-16' : 'md:w-60',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-[#dedde4] dark:border-[#2a2734] px-5">
        <img src="/favicon.svg" alt="Siesta" className="h-7 w-7 shrink-0" />
        {(!collapsed || onNavigate) && (
          <span className="font-display text-xl font-bold text-[#6b26d9] dark:text-[#8249df] md:hidden">Siesta</span>
        )}
        {!collapsed && (
          <span className="font-display text-xl font-bold text-[#6b26d9] dark:text-[#8249df] hidden md:inline">Siesta</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                onClick={onNavigate}
                className={clsx(
                  'flex items-center rounded-xl py-2 text-sm font-medium text-[#191726] dark:text-[#f2f2f2] transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]',
                  'gap-3 px-3',
                  collapsed && 'md:justify-center md:px-2 md:gap-0',
                )}
                activeProps={{
                  className: clsx(
                    'flex items-center rounded-xl py-2 text-sm font-medium bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df]',
                    'gap-3 px-3',
                    collapsed && 'md:justify-center md:px-2 md:gap-0',
                  ),
                }}
                title={collapsed ? item.label : undefined}
              >
                <NavIcon letter={item.icon} />
                <span className={clsx(collapsed && 'md:hidden')}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Upcoming Meetings */}
      {collapsed ? (
        <div className="hidden md:flex justify-center px-3 py-2" title={`${meetingCount} upcoming meeting${meetingCount !== 1 ? 's' : ''}`}>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df]">
            <CalendarIcon />
            {meetingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#6b26d9] dark:bg-[#8249df] text-[10px] font-bold text-white">
                {meetingCount > 9 ? '9+' : meetingCount}
              </span>
            )}
          </span>
        </div>
      ) : null}
      {/* Expanded meetings: always on mobile, conditional on desktop */}
      <div className={clsx(
        'border-t border-[#dedde4] dark:border-[#2a2734] px-3 pt-3 pb-2 min-h-0 flex flex-col overflow-hidden',
        collapsed ? 'md:hidden' : '',
      )}>
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#6b677e] dark:text-[#858198] shrink-0">
          Upcoming Meetings
        </p>
        <div className="overflow-y-auto min-h-0">
          <UpcomingMeetingsSection />
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User section — always show on mobile, hide on desktop when collapsed */}
      {user && (
        <Link
          to="/settings"
          onClick={onNavigate}
          className={clsx(
            'block border-t border-[#dedde4] dark:border-[#2a2734] p-4 transition-colors hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]',
            collapsed && 'md:hidden',
          )}
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

      {/* Collapse toggle — desktop only */}
      <div className={clsx('hidden md:block border-t border-[#dedde4] dark:border-[#2a2734] p-2', collapsed && 'md:flex md:justify-center')}>
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
