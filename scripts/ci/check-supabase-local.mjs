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

console.log(JSON.stringify({
  baseUrl,
  health: 'ok',
  reminderJob: job.body.data,
  publicTableCount: db.body.data.publicTableCount,
}));
