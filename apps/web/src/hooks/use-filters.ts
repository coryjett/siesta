import { useCallback, useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

export function useFilters<T extends Record<string, unknown>>(
  defaults: T,
): [T, (updates: Partial<T>) => void] {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const filters = useMemo(() => {
    const merged = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (search[key] !== undefined) {
        (merged as Record<string, unknown>)[key] = search[key];
      }
    }
    return merged;
  }, [defaults, search]);

  const setFilters = useCallback(
    (updates: Partial<T>) => {
      navigate({
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, ...updates };
          // Remove keys that match defaults to keep URL clean
          for (const [key, value] of Object.entries(next)) {
            if (
              key in defaults &&
              value === (defaults as Record<string, unknown>)[key]
            ) {
              delete next[key];
            }
          }
          return next;
        },
      });
    },
    [navigate, defaults],
  );

  return [filters, setFilters];
}
