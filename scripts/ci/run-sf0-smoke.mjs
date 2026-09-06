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


// Tag lifecycle must work with the same Edge API deployed to staging/production.
const tagCreated = await request('/api/tags', { method: 'POST', token: accessToken, body: { name: 'smoke-tag' } });
assert.equal(tagCreated.response.status, 201);
const tagId = tagCreated.payload.data.id;
const tagged = await request(`/api/tasks/${taskId}`, { method: 'PATCH', token: accessToken, body: { tagIds: [tagId] } });
assert.equal(tagged.response.status, 200);
const renamed = await request(`/api/tags/${tagId}`, { method: 'PATCH', token: accessToken, body: { name: 'smoke-renamed', color: '#123456' } });
assert.equal(renamed.response.status, 200);
assert.equal(renamed.payload.data.name, 'smoke-renamed');
assert.equal((await request(`/api/tags/${tagId}`, { method: 'DELETE', token: accessToken })).response.status, 200);
const untagged = await request(`/api/tasks/${taskId}`, { token: accessToken });
assert.deepEqual(untagged.payload.data.tagIds, []);
const recreated = await Promise.all([1, 2].map(() => request('/api/tags', { method: 'POST', token: accessToken, body: { name: 'smoke-renamed' } })));
assert.deepEqual(recreated.map(item => item.response.status).sort(), [201, 409]);
assert.equal(recreated.find(item => item.response.status === 201).payload.data.id, tagId);
assert.deepEqual((await request(`/api/tasks/${taskId}`, { token: accessToken })).payload.data.tagIds, []);

const recurring = await request('/api/tasks', { method: 'POST', token: accessToken, body: { title: 'Smoke recurring', deadline: { date: '2099-01-01' }, rrule: 'FREQ=DAILY;COUNT=2' } });
assert.equal(recurring.response.status, 201);
const recurringId = recurring.payload.data.id;
const completed = await Promise.all([1, 2].map(() => request(`/api/tasks/${recurringId}/complete`, { method: 'POST', token: accessToken })));
for (const result of completed) { assert.equal(result.response.status, 200); assert.ok(result.payload.data.completedAt); }
const nextId = completed[0].payload.data.nextTask.id;
assert.equal(completed[1].payload.data.nextTask.id, nextId);
assert.equal((await request(`/api/tasks/${nextId}`, { method: 'PATCH', token: accessToken, body: { deadline: { date: '2099-01-05' } } })).response.status, 200);
const last = await request(`/api/tasks/${nextId}/complete`, { method: 'POST', token: accessToken });
assert.equal(last.response.status, 200);
assert.equal(last.payload.data.nextTask, null);
await request(`/api/tasks/${nextId}`, { method: 'DELETE', token: accessToken });
await request(`/api/tasks/${recurringId}/reopen`, { method: 'POST', token: accessToken });
const repeated = await request(`/api/tasks/${recurringId}/complete`, { method: 'POST', token: accessToken });
assert.equal(repeated.response.status, 200);
assert.ok(repeated.payload.data.completedAt);
assert.equal(repeated.payload.data.nextTask, null);

const reminder = await request(`/api/tasks/${taskId}/reminders`, {
  method: 'POST',
  token: accessToken,
  body: { remindAt: new Date(Date.now() + 60_000).toISOString(), type: 'push' },
});
assert.equal(reminder.response.status, 201);

await new Promise(resolve => setTimeout(resolve, 61_000));
const firstClaim = await request('/jobs-reminders', { method: 'POST' });
assert.equal(firstClaim.response.status, 200);
// Production may already contain due task/countdown notifications. The
// worker processes those in the same batch, so assert the synthetic reminder
// was included without assuming the shared database is empty.
assert.ok(firstClaim.payload.data.processed >= 1);

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
