import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    if (err) {
      setError(decodeURIComponent(err));
    } else if (!document.referrer && !params.has('logout')) {
      // Auto-redirect to Keycloak only on direct navigation (not after logout)
      window.location.href = '/auth/login';
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0c12]">
      <div className="max-w-md w-full rounded-2xl border border-[rgba(58,55,73,0.5)] p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(27,25,36,0.8), rgba(18,17,24,0.9))',
          backdropFilter: 'blur(12px)',
        }}
      >
        <h1 className="font-display text-3xl font-bold text-center mb-2 text-white">Siesta</h1>
        <p className="text-[#858198] text-center mb-8">Sales Engineer Portfolio Management</p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={() => { window.location.href = '/auth/login'; }}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#6b26d9] hover:bg-[#7c3aed] text-white rounded-xl font-medium transition-colors shadow-lg shadow-purple-500/20"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Sign in
        </button>
      </div>
    </div>
  );
}
