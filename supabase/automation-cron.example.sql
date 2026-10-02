-- Hourly automation job (SvS draw, battle start/end, results, Monday player
-- sync). Run this ONCE in the Supabase SQL Editor after the app is deployed.
--
-- 1. Pick a long random secret and set it as CRON_SECRET in the app's
--    environment (e.g. Vercel project settings).
-- 2. Replace both placeholders below and run the script.

create extension if not exists pg_net;

-- Stores the secret encrypted instead of in the job text.
select vault.create_secret('REPLACE_WITH_CRON_SECRET', 'wos_cron_secret');

select cron.schedule(
  'wos-automation',
  '7 * * * *', -- every hour at :07
  $$
  select net.http_post(
    url := 'https://REPLACE_WITH_YOUR_APP_DOMAIN/api/automation/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'wos_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- To stop it:   select cron.unschedule('wos-automation');
-- Run history:  select * from cron.job_run_details order by start_time desc limit 20;
