import { json, methodNotAllowed, notFound } from '../_shared/http.ts';

/**
 * SF0 Edge API shell.
 *
 * The existing Fastify API remains the source of truth while the migration is
 * validated. Keep this function deliberately small: each route is ported only
 * after its contract test can compare it with Fastify.
 */
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  if (path === '/health') {
    return json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  if (path === '/') {
    return json({ success: true, data: { service: 'mindoist-edge-api', phase: 'SF0' } });
  }

  // Local-only probe for the transaction-pooler adapter. It is disabled by
  // default and therefore cannot expose schema details in a deployed function.
  if (path === '/__sf0/db-check' && Deno.env.get('SF0_DIAGNOSTICS') === '1') {
    const { sql } = await import('../_shared/db.ts');
    const [{ tableCount }] = await sql<{ tableCount: number }[]>`
      select count(*)::int as "tableCount"
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    return json({ success: true, data: { publicTableCount: tableCount } });
  }

  if (path === '/__sf0/dependencies' && Deno.env.get('SF0_DIAGNOSTICS') === '1') {
    const startedAt = performance.now();
    const diagnostics: Record<string, unknown> = {};

    try {
      const module = await import('npm:web-push@3.6.7');
      const webPush = (module.default ?? module) as { generateVAPIDKeys?: () => { publicKey: string; privateKey: string } };
      const keys = webPush.generateVAPIDKeys?.();
      diagnostics.webPush = { ok: Boolean(keys?.publicKey && keys?.privateKey) };
    } catch (error) {
      diagnostics.webPush = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    try {
      const module = await import('npm:csv-parse@7.0.1/sync');
      const parse = (module.parse ?? module.default) as (input: string) => unknown[][];
      const row = `"${'x'.repeat(998)}",ok\n`;
      const csv = row.repeat(Math.ceil(10_000_000 / row.length));
      const rows = parse(csv);
      diagnostics.csv10mb = { ok: rows.length > 9_000, bytes: csv.length, rows: rows.length };
    } catch (error) {
      diagnostics.csv10mb = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&client_id=sf0-local&client_secret=synthetic&refresh_token=synthetic',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      diagnostics.googleRest = { ok: response.status >= 400 && response.status < 500, status: response.status };
    } catch (error) {
      diagnostics.googleRest = { ok: false, skipped: true, error: error instanceof Error ? error.message : String(error) };
    }

    return json({ success: true, data: { ...diagnostics, elapsedMs: Math.round(performance.now() - startedAt) } });
  }

  if (Deno.env.get('SF0_FEATURES') === '1') {
    const {
      createReminder,
      createTask,
      getTaskCounts,
      listTasks,
      login,
      refresh,
      register,
      requireAuth,
    } = await import('../_shared/sf0.ts');

    const { routeProjects } = await import('../_shared/projects.ts');
    const { routeTaskCore } = await import('../_shared/tasks-core.ts');
    const { routeSupporting } = await import('../_shared/supporting.ts');
    const { routeApiKeys } = await import('../_shared/api-keys.ts');
    const { routeSync } = await import('../_shared/sync.ts');
    const { routeCalendar, routeCountdowns } = await import('../_shared/calendar.ts');
    const { routeGcal } = await import('../_shared/gcal.ts');
    const { routeTelegram } = await import('../_shared/telegram.ts');
    const { routeExport } = await import('../_shared/export.ts');
    const { routeImport } = await import('../_shared/import.ts');
    const { routeAuthExtra } = await import('../_shared/auth-extra.ts');
    const { routeReminders } = await import('../_shared/reminders.ts');
    const { routeAgentDrafts } = await import('../_shared/agent-drafts.ts');
    const { routeDrive } = await import('../_shared/drive.ts');
    const { routeAdmin } = await import('../_shared/admin.ts');

    const body = async () => {
      try {
        return await request.json() as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    if (path === '/auth/register' && request.method === 'POST') {
      const result = await register(await body());
      return json(result.body, { status: result.status });
    }
    if (path === '/auth/login' && request.method === 'POST') {
      const result = await login(await body());
      return json(result.body, { status: result.status });
    }
    if (path === '/auth/refresh' && request.method === 'POST') {
      const input = await body();
      const result = await refresh(input.refreshToken);
      return json(result.body, { status: result.status });
    }
    if (path === '/auth/me' && request.method === 'GET') {
      const auth = await requireAuth(request);
      if (auth instanceof Response) return auth;
      return json({ success: true, data: auth.user });
    }
    if (/^\/auth\//.test(path)) {
      const authExtraResponse = await routeAuthExtra(path, request);
      if (authExtraResponse) return authExtraResponse;
    }
    if (path === '/tasks' && request.method === 'GET') {
      const auth = await requireAuth(request, 'tasks:read');
      if (auth instanceof Response) return auth;
      return json({ success: true, data: await listTasks(auth.user.id) });
    }
    if (path === '/tasks' && request.method === 'POST') {
      const auth = await requireAuth(request, 'tasks:write');
      if (auth instanceof Response) return auth;
      const result = await createTask(auth.user.id, await body());
      return json(result.body, { status: result.status });
    }
    if (path === '/task-counts' && request.method === 'GET') {
      const auth = await requireAuth(request);
      if (auth instanceof Response) return auth;
      return json({ success: true, data: await getTaskCounts(auth.user.id) });
    }
    const reminderMatch = path.match(/^\/tasks\/([^/]+)\/reminders$/);
    if (reminderMatch && request.method === 'POST') {
      const auth = await requireAuth(request, 'tasks:write');
      if (auth instanceof Response) return auth;
      const result = await createReminder(auth.user.id, reminderMatch[1], await body());
      return json(result.body, { status: result.status });
    }
    if (path === '/__sf0/reminders/claim' && request.method === 'POST' && Deno.env.get('SF0_DIAGNOSTICS') === '1') {
      const { claimDueReminders } = await import('../_shared/sf0.ts');
      const claimed = await claimDueReminders();
      return json({ success: true, data: { processed: claimed.length, claimed } });
    }

    if (/^(\/tasks\/|\/reminders\/|\/checklist-items\/)/.test(path)) {
      const taskResponse = await routeTaskCore(path, request);
      if (taskResponse) return taskResponse;
    }

    if (path === '/reminders/upcoming') {
      const remindersResponse = await routeReminders(path, request);
      if (remindersResponse) return remindersResponse;
    }

    if (/^\/agent\/drafts(?:\/|$)/.test(path)) {
      const draftResponse = await routeAgentDrafts(path, request);
      if (draftResponse) return draftResponse;
    }

    if (/^\/drive\//.test(path)) {
      const driveResponse = await routeDrive(path, request);
      if (driveResponse) return driveResponse;
    }

    if (/^\/admin\//.test(path) || path === '/internal/agent/ai-config') {
      const adminResponse = await routeAdmin(path, request);
      if (adminResponse) return adminResponse;
    }

    if (/^\/(projects|sections|tags)(\/|$)/.test(path)) {
      const projectResponse = await routeProjects(path, request);
      if (projectResponse) return projectResponse;
    }

    if (/^\/(areas|notes|settings)(\/|$)/.test(path)) {
      const supportingResponse = await routeSupporting(path, request);
      if (supportingResponse) return supportingResponse;
    }

    if (/^\/api-keys(\/|$)/.test(path)) {
      const apiKeyResponse = await routeApiKeys(path, request);
      if (apiKeyResponse) return apiKeyResponse;
    }

    if (/^\/sync\//.test(path)) {
      const syncResponse = await routeSync(path, request);
      if (syncResponse) return syncResponse;
    }

    if (path === '/calendar/projection' || /^\/time-blocks(?:\/|$)/.test(path) || /^\/push\//.test(path)) {
      const calendarResponse = await routeCalendar(path, request);
      if (calendarResponse) return calendarResponse;
    }

    if (/^\/countdowns(?:\/|$)/.test(path)) {
      const countdownResponse = await routeCountdowns(path, request);
      if (countdownResponse) return countdownResponse;
    }

    if (path === '/calendar/providers' || /^\/calendar\/providers\//.test(path) || /^\/gcal\//.test(path)) {
      const gcalResponse = await routeGcal(path, request);
      if (gcalResponse) return gcalResponse;
    }

    if (/^\/integrations\/telegram\//.test(path) || /^\/internal\/agent\/telegram\//.test(path)) {
      const telegramResponse = await routeTelegram(path, request);
      if (telegramResponse) return telegramResponse;
    }

    if (path === '/export/json' || path === '/export/csv') {
      const exportResponse = await routeExport(path, request);
      if (exportResponse) return exportResponse;
    }

    if (path === '/import/ticktick/preview' || path === '/import/ticktick/confirm') {
      const importResponse = await routeImport(path, request);
      if (importResponse) return importResponse;
    }
  }

  if (request.method !== 'GET') return methodNotAllowed();

  return notFound(path);
});
