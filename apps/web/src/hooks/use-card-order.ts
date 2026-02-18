import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'siesta:card-order:';

export function useCardOrder(pageKey: string, defaultOrder: string[]) {
  const storageKey = `${STORAGE_PREFIX}${pageKey}`;

  const [orderedIds, setOrderedIdsState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        // Validate: must contain the same set of IDs
        if (
          parsed.length === defaultOrder.length &&
          defaultOrder.every((id) => parsed.includes(id))
        ) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return defaultOrder;
  });

  const setOrderedIds = useCallback(
    (ids: string[]) => {
      setOrderedIdsState(ids);
      try {
        localStorage.setItem(storageKey, JSON.stringify(ids));
      } catch {
        // ignore quota errors
      }
    },
    [storageKey],
  );

  return { orderedIds, setOrderedIds };
}
