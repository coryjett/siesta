import { useNavigate } from '@tanstack/react-router';

export default function OpportunityDetailPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Opportunity</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Opportunity details are now available through the account detail page.
      </p>
      <button
        type="button"
        onClick={() => navigate({ to: '/accounts' })}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        View Accounts
      </button>
    </div>
  );
}
