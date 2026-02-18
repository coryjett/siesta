import { Link } from '@tanstack/react-router';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Page not found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Go home
        </Link>
      </div>
    </div>
  );
}
