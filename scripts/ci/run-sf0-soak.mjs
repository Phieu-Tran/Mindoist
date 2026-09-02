import assert from 'node:assert/strict';

const baseUrl = (process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:55421/functions/v1').replace(/\/$/, '');
const durationMinutes = Number(process.env.SF0_SOAK_MINUTES ?? 10);
const intervalMs = Number(process.env.SF0_SOAK_INTERVAL_MS ?? 30_000);
const cyclesTarget = Math.max(1, Math.ceil((durationMinutes * 60_000) / intervalMs));
const email = `sf0-soak-${Date.now()}@mindoist.local`;
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
  body: { email, password: 'sf0-local-password', name: 'SF0 Soak' },
});
assert.equal(registered.response.status, 201);
const token = registered.payload.data.accessToken;

const task = await request('/api/tasks', {
  method: 'POST',
  token,
  body: { title: 'SF0 reminder soak fixture' },
});
assert.equal(task.response.status, 201);
const taskId = task.payload.data.id;

const startedAt = Date.now();
const latencies = [];
for (let cycle = 1; cycle <= cyclesTarget; cycle += 1) {
  const remindAt = Date.now() + 1_000;
  const reminder = await request(`/api/tasks/${taskId}/reminders`, {
    method: 'POST',
    token,
    body: { remindAt: new Date(remindAt).toISOString(), type: 'push' },
  });
  assert.equal(reminder.response.status, 201);

  await new Promise(resolve => setTimeout(resolve, 1_500));
  const claimed = await request('/jobs-reminders', { method: 'POST' });
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.payload.data.processed, 1);
  const duplicate = await request('/jobs-reminders', { method: 'POST' });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.payload.data.processed, 0);

  const latency = Date.now() - remindAt;
  latencies.push(latency);
  console.log(JSON.stringify({ cycle, cyclesTarget, latencyMs: latency, duplicateClaim: 0 }));

  const nextCycleAt = startedAt + cycle * intervalMs;
  const waitMs = nextCycleAt - Date.now();
  if (cycle < cyclesTarget && waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
}

console.log(JSON.stringify({
  durationMinutes,
  cycles: latencies.length,
  maxLatencyMs: Math.max(...latencies),
  p50LatencyMs: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)],
  duplicateClaims: 0,
}));
