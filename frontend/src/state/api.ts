import { useEffect, useState } from 'react';

/** Shared JSON client for the session-protected same-origin API. */
export async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch('/api/' + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (response.status === 401) {
    location.assign('/login');
    throw Error('Please sign in again.');
  }

  // Do not leave UI spinning forever when a proxy sends HTML or an empty body.
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw Error('Unexpected response from the server. Please try again.');
  }

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Unable to save. Please try again.';
    throw Error(message);
  }
  return data;
}

/** Async data hook; prevents late requests from writing to an unmounted view. */
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    api(path)
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [path, version]);

  return { data, error, setData, reload: () => setVersion(previous => previous + 1) };
}
