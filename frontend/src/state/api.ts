import { useEffect, useState } from 'react';
import { api } from '../services/apiClient';

// Preserve the established import contract for existing React components.
export { api, ApiError } from '../services/apiClient';

/**
 * Async data hook with explicit loading/error state and request cancellation.
 * A previous request cannot update the component after a path change/unmount.
 */
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);

    api<T>(path, 'GET', undefined, { signal: controller.signal })
      .then(result => setData(result))
      .catch(reason => {
        if (controller.signal.aborted || reason?.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Unable to load data. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [path, version]);

  return {
    data,
    error,
    loading,
    setData,
    reload: () => setVersion(previous => previous + 1)
  };
}
