// API fetch utility with automatic JWT token attachment and 401 interception
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('tinglan_auth_token');
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('tinglan_auth_token', token);
    } else {
      localStorage.removeItem('tinglan_auth_token');
    }
  } catch {}
}

/**
 * [P0 Security Fix companion] Append the stored JWT to same-origin stream URLs.
 * The server's /api/stream & /api/tts routes now enforce access control; browser
 * <audio>/<img> elements and DLNA cast URLs cannot send Authorization headers,
 * so the JWT travels as a query parameter instead.
 * - Only same-origin paths (starting with '/') are touched; remote URLs unchanged
 * - An existing ?token= (server-signed speaker/HMAC URLs) is never overridden
 */
export function appendAuthToken<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  const rawUrl = String(url);
  if (!rawUrl.startsWith('/')) return url;
  const token = getAuthToken();
  if (!token) return url;
  if (/[?&]token=/.test(rawUrl)) return url;
  return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` as T;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  if (response.status === 401) {
    // Notify application that authentication is required or token expired
    window.dispatchEvent(new CustomEvent('tinglan_unauthorized', {
      detail: { url: typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url) }
    }));
  }

  return response;
}
