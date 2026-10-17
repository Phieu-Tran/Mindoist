import assert from 'node:assert/strict';

const baseUrl = (process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:55421/functions/v1').replace(/\/$/, '');
const jobSecret = process.env.SF0_JOB_SECRET ?? 'sf0-local-job-secret';

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  if (path === '/jobs-reminders') headers.set('x-job-secret', jobSecret);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON (${response.status}): ${text}`);
  }
  return { response, body };
}

const health = await request('/api/health');
assert.equal(health.response.status, 200);
assert.equal(health.body.status, 'ok');

const job = await request('/jobs-reminders', { method: 'POST' });
assert.equal(job.response.status, 200);
assert.equal(job.body.success, true);

const db = await request('/api/__sf0/db-check');
assert.equal(db.response.status, 200);
assert.equal(db.body.success, true);
assert.ok(db.body.data.publicTableCount >= 31);

// Error boundary: a thrown error must answer JSON with CORS headers (request()
// above throws on the old plain-text 500), a transient database error 503.
const bug = await request('/api/__sf0/fail?kind=bug');
assert.equal(bug.response.status, 500);
assert.deepEqual(bug.body, { success: false, error: 'Internal server error' });
assert.equal(bug.response.headers.get('access-control-allow-origin'), '*');

const dbDown = await request('/api/__sf0/fail?kind=db');
assert.equal(dbDown.response.status, 503);
assert.equal(dbDown.body.success, false);
assert.equal(dbDown.body.retryable, true);
assert.equal(dbDown.response.headers.get('retry-after'), '1');
assert.equal(dbDown.response.headers.get('access-control-allow-origin'), '*');

// A read that hits a transient error is tried once more; a write never is.
const flakyRead = await request(`/api/__sf0/flaky?key=read-${crypto.randomUUID()}`);
assert.equal(flakyRead.response.status, 200);
assert.equal(flakyRead.body.data.attempts, 2);
const flakyWrite = await request(`/api/__sf0/flaky?key=write-${crypto.randomUUID()}`, { method: 'POST' });
assert.equal(flakyWrite.response.status, 503);

console.log(JSON.stringify({
  baseUrl,
  health: 'ok',
  reminderJob: job.body.data,
  publicTableCount: db.body.data.publicTableCount,
  errorBoundary: { bug: bug.response.status, dbDown: dbDown.response.status, readRetries: flakyRead.body.data.attempts - 1, write: flakyWrite.response.status },
}));
