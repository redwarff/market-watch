export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Sign in required.');
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as { error?: string }) : {};
  if (!res.ok) throw new Error(body.error || 'Request failed.');
  return body as T;
}
