-- Staging-only SF0 reminder probe. The runtime secret is kept in Supabase
-- Vault instead of being embedded in this migration or a GitHub workflow.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mindoist-sf0-reminders') then
    perform cron.unschedule('mindoist-sf0-reminders');
  end if;
end
$$;

select cron.schedule(
  'mindoist-sf0-reminders',
  '30 seconds',
  $$
  select net.http_post(
    url := 'https://atgnpgilprobrqauwucd.supabase.co/functions/v1/jobs-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'mindoist_sf0_job_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
