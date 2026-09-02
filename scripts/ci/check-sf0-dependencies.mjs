import assert from 'node:assert/strict';

const baseUrl = (process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:55421/functions/v1').replace(/\/$/, '');
const response = await fetch(`${baseUrl}/api/__sf0/dependencies`);
const body = await response.json();

assert.equal(response.status, 200);
assert.equal(body.success, true);
assert.equal(body.data.webPush.ok, true);
assert.equal(body.data.csv10mb.ok, true);

console.log(JSON.stringify(body.data));
