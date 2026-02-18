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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const handleChange = (fieldName: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  return (
    <Card title={title}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-gray-600">Status:</span>
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
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {field.label}
            </label>
            <input
              id={`${provider}-${field.name}`}
              type={field.type}
              value={values[field.name]}
              onChange={(e) => handleChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              required
            />
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
