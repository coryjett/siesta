import { useState } from 'react';
import Card from '../common/card';
import Badge from '../common/badge';

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
}

interface OAuthConnectionProps {
  provider: string;
  title: string;
  fields: FieldConfig[];
  onSubmit: (values: Record<string, string>) => void;
  isConnected: boolean;
  isConfigured: boolean;
  isLoading?: boolean;
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function OAuthConnection({
  provider,
  title,
  fields,
  onSubmit,
  isConnected,
  isConfigured,
  isLoading = false,
}: OAuthConnectionProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.name] = '';
    }
    return initial;
  });
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const handleChange = (fieldName: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  };

  return (
    <Card title={title}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
        {isConnected ? (
          <Badge variant="success">Connected</Badge>
        ) : isConfigured ? (
          <Badge variant="warning">Configured (not connected)</Badge>
        ) : (
          <Badge variant="danger">Not Connected</Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={`${provider}-${field.name}`}
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {field.label}
            </label>
            <div className="relative">
              <input
                id={`${provider}-${field.name}`}
                type={field.type === 'password' && visiblePasswords[field.name] ? 'text' : field.type}
                value={values[field.name]}
                onChange={(e) => handleChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm${field.type === 'password' ? ' pr-10' : ''}`}
                required
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility(field.name)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label={visiblePasswords[field.name] ? 'Hide password' : 'Show password'}
                >
                  {visiblePasswords[field.name] ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              )}
            </div>
          </div>
        ))}

        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Connection'}
        </button>
      </form>
    </Card>
  );
}
