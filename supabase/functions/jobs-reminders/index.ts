import { json } from '../_shared/http.ts';

/**
 * Cron target placeholder for SF0. The real claim/send implementation is
 * enabled only after the schema and delivery contract are ported and tested.
 */
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  }

  const expectedSecret = Deno.env.get('JOBS_SECRET');
  if (!expectedSecret || request.headers.get('x-job-secret') !== expectedSecret) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (Deno.env.get('SF0_FEATURES') === '1') {
    const { claimDueReminders } = await import('../_shared/sf0.ts');
    const claimed = await claimDueReminders();
    return json({ success: true, data: { processed: claimed.length, claimed, phase: 'SF0' } });
  }

  return json({ success: true, data: { processed: 0, phase: 'SF0-shell' } });
});
