import { json } from './http.ts';

/**
 * Error boundary for the Edge API.
 *
 * Without it, anything a route throws (a dropped database connection, a bug)
 * reaches Deno's default handler, which answers a plain-text
 * `500 Internal Server Error` with no CORS headers: the browser hides it from
 * the app and JSON clients fail to parse it. Every failure now answers JSON
 * with the usual CORS headers, logs one structured line, and a read that hit
 * a transient database error is tried once more before giving up.
 */

// postgres.js connection failures, Deno's own network error names, and the
// Postgres SQLSTATEs that mean "the same request can succeed in a moment".
const TRANSIENT_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);
const TRANSIENT_NAMES = new Set(['ConnectionRefused', 'ConnectionReset', 'ConnectionAborted', 'TimedOut', 'BrokenPipe']);

const RETRY_DELAY_MS = 150;

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
}

export function isTransientDbError(error: unknown): boolean {
  const { name, code } = (error ?? {}) as ErrorLike;
  if (typeof code === 'string' && (TRANSIENT_CODES.has(code) || code.startsWith('08'))) return true;
  return typeof name === 'string' && TRANSIENT_NAMES.has(name);
}

export function unhandledErrorResponse(error: unknown) {
  if (isTransientDbError(error)) {
    return json(
      { success: false, error: 'Service temporarily unavailable. Please try again.', retryable: true },
      { status: 503, headers: { 'retry-after': '1' } },
    );
  }
  return json({ success: false, error: 'Internal server error' }, { status: 500 });
}

// One JSON line per failure, readable in the Supabase function logs. Only the
// path (no query string), never headers, bodies or tokens.
function logUnhandledError(request: Request, attempt: number, error: unknown) {
  const { name, code, message } = (error ?? {}) as ErrorLike;
  console.error(JSON.stringify({
    event: 'api_unhandled_error',
    method: request.method,
    path: new URL(request.url).pathname,
    attempt,
    transient: isTransientDbError(error),
    name: typeof name === 'string' ? name : undefined,
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message.slice(0, 300) : String(error).slice(0, 300),
  }));
}

/**
 * Wraps the request handler. Reads (GET/HEAD) that fail with a transient
 * database error run once more after a short pause; writes never do, because
 * the first attempt may already have committed.
 */
export function withErrorBoundary(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const retryable = request.method === 'GET' || request.method === 'HEAD';
    for (let attempt = 1; ; attempt++) {
      try {
        return await handler(request);
      } catch (error) {
        logUnhandledError(request, attempt, error);
        if (attempt === 1 && retryable && isTransientDbError(error)) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }
        return unhandledErrorResponse(error);
      }
    }
  };
}
