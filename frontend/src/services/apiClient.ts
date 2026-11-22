type ApiOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

/** A safe, typed error returned by the shared same-origin API client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function apiUrl(path: string): string {
  const normalized = path.replace(/^\/+/, '');
  return normalized.startsWith('api/') ? `/${normalized}` : `/api/${normalized}`;
}

async function readResponse(response: Response): Promise<any> {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text.trim()) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError('The server returned invalid JSON. Please try again.', response.status, 'INVALID_RESPONSE');
    }
  }

  if (response.ok) {
    throw new ApiError('The server returned an unexpected response. Please try again.', response.status, 'UNEXPECTED_RESPONSE');
  }
  // Do not surface HTML error pages or proxy diagnostics inside application UI.
  return { message: 'The server could not complete the request. Please try again.' };
}

/** Shared JSON client for the session-protected same-origin API. */
export async function api<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
  options: ApiOptions = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined') window.location.assign('/login');
    throw new ApiError('Please sign in again.', 401, 'UNAUTHORIZED');
  }

  const data = await readResponse(response);
  if (!response.ok) {
    const message = typeof data?.error === 'string'
      ? data.error
      : typeof data?.message === 'string'
        ? data.message
        : 'Unable to complete the request. Please try again.';
    throw new ApiError(message, response.status, typeof data?.code === 'string' ? data.code : 'API_ERROR');
  }

  return data as T;
}
