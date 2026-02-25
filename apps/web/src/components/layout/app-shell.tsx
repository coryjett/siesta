import { Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from '../../contexts/auth-context';
import Sidebar from './sidebar';
import Header from './header';
import { Spinner } from '../common/loading';
import ChatWidget from '../chat/chat-widget';

const routeTitles: Record<string, string> = {
  '/': 'Home',
  '/portfolio': 'Portfolio',
  '/accounts': 'Accounts',
  '/search': 'Search',
  '/settings': 'Settings',
};

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const matches = useMatches();

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
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={pageTitle} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
