-- Build-order step 7: daily pg_cron job calling process-recurring-rules.
-- pg_net lets Postgres make outbound HTTP calls from a cron job.
create extension if not exists pg_net;

-- 1:00 AM UTC (~6:30 AM IST) daily. Uses the public anon/publishable key,
-- not the service-role key — safe to store in a system table since it's
-- meant to be public; the function itself uses the service-role key
-- internally to bypass RLS.
select cron.schedule(
  'process-recurring-rules-daily',
  '0 1 * * *',
  $$
  select net.http_post(
    url := 'https://kkkroitzdwilkejbuzjd.supabase.co/functions/v1/process-recurring-rules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_eGIOqAM1QvpOdvwS8NG3FA_1HbgQZww',
      'apikey', 'sb_publishable_eGIOqAM1QvpOdvwS8NG3FA_1HbgQZww'
    ),
    body := '{}'::jsonb
  );
  $$
);
