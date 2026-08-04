function getToken() {
  return localStorage.getItem('token');
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (!headers['Content-Type'] && init?.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, {
    ...init,
    headers,
  });
  const body = await response.json();
  if (!body.success) throw new Error(body.error || 'API error');
  return body.data;
}
