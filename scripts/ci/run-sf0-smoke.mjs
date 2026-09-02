import assert from 'node:assert/strict';

const baseUrl = (process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:55421/functions/v1').replace(/\/$/, '');
const email = `sf0-${Date.now()}@mindoist.local`;
const password = 'sf0-local-password';
const jobSecret = process.env.SF0_JOB_SECRET ?? 'sf0-local-job-secret';

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(path === '/jobs-reminders' ? { 'x-job-secret': jobSecret } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { response, payload };
}

const registered = await request('/api/auth/register', {
  method: 'POST',
  body: { email, password, name: 'SF0 Smoke' },
});
assert.equal(registered.response.status, 201);
assert.equal(registered.payload.success, true);
assert.equal(registered.payload.data.user.email, email);

const login = await request('/api/auth/login', { method: 'POST', body: { email, password } });
assert.equal(login.response.status, 200);
const accessToken = login.payload.data.accessToken;
const refreshToken = login.payload.data.refreshToken;
assert.ok(accessToken && refreshToken);

const me = await request('/api/auth/me', { token: accessToken });
assert.equal(me.response.status, 200);
assert.equal(me.payload.data.email, email);

const before = await request('/api/tasks', { token: accessToken });
assert.equal(before.response.status, 200);
assert.deepEqual(before.payload.data, []);

const createdTask = await request('/api/tasks', {
  method: 'POST',
  token: accessToken,
  body: { title: 'SF0 smoke task', description: 'local only', priority: 2, deadline: { date: '2099-01-01' } },
});
assert.equal(createdTask.response.status, 201);
const taskId = createdTask.payload.data.id;
assert.equal(createdTask.payload.data.deadline.date, '2099-01-01');

const reminder = await request(`/api/tasks/${taskId}/reminders`, {
  method: 'POST',
  token: accessToken,
  body: { remindAt: new Date(Date.now() + 60_000).toISOString(), type: 'push' },
});
assert.equal(reminder.response.status, 201);

await new Promise(resolve => setTimeout(resolve, 1500));
const firstClaim = await request('/jobs-reminders', { method: 'POST' });
assert.equal(firstClaim.response.status, 200);
assert.equal(firstClaim.payload.data.processed, 1);

const secondClaim = await request('/jobs-reminders', { method: 'POST' });
assert.equal(secondClaim.response.status, 200);
assert.equal(secondClaim.payload.data.processed, 0);

const job = await request('/jobs-reminders', { method: 'POST' });
assert.equal(job.response.status, 200);
assert.equal(job.payload.data.processed, 0);

const refreshed = await request('/api/auth/refresh', { method: 'POST', body: { refreshToken } });
assert.equal(refreshed.response.status, 200);
assert.ok(refreshed.payload.data.accessToken && refreshed.payload.data.refreshToken);

console.log(JSON.stringify({
  baseUrl,
  email,
  userId: registered.payload.data.user.id,
  taskId,
  reminderId: reminder.payload.data.id,
  reminderClaim: firstClaim.payload.data.processed,
  duplicateClaim: secondClaim.payload.data.processed,
  refreshRotation: true,
}));
