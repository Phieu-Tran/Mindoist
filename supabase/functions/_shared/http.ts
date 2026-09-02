export const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-api-key, content-type, x-job-secret',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(jsonHeaders);
  for (const [key, value] of new Headers(init.headers).entries()) headers.set(key, value);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function notFound(path: string) {
  return json({ success: false, error: `Route not found: ${path}` }, { status: 404 });
}

export function methodNotAllowed() {
  return json({ success: false, error: 'Method not allowed' }, { status: 405 });
}
