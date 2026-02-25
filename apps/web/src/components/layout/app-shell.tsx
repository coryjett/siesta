import { Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/auth-context';
import Sidebar from './sidebar';
import Header from './header';
import { Spinner } from '../common/loading';
import ChatWidget from '../chat/chat-widget';

const routeTitles: Record<string, string> = {
  '/': 'Home',
  '/portfolio': 'Portfolio',
  '/accounts': 'Accounts',
  '/opportunities': 'Opportunities',
  '/settings': 'Settings',
};

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const matches = useMatches();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f9f9fb] dark:bg-[#0d0c12]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Determine page title from the deepest matching route
  const currentPath = matches[matches.length - 1]?.pathname ?? '/';
  const pageTitle = routeTitles[currentPath] ?? 'Siesta';

  return (
    <div className="flex h-screen bg-[#f9f9fb] dark:bg-[#0d0c12]">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile drawer overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 h-full w-60">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={pageTitle} onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
