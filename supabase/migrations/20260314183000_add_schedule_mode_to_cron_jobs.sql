ALTER TABLE public.cron_jobs
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT;

UPDATE public.cron_jobs
SET schedule_mode = CASE
  WHEN schedule_mode IS NOT NULL THEN schedule_mode
  WHEN lower(coalesce(schedule, '')) = 'draft' THEN 'draft'
  WHEN coalesce(schedule, '') LIKE '*/15 %' THEN '15m'
  WHEN coalesce(schedule, '') LIKE '*/30 %' THEN '30m'
  WHEN coalesce(schedule, '') LIKE '% */4 %' THEN '4h'
  WHEN coalesce(schedule, '') LIKE '% * * * *' THEN '1h'
  WHEN coalesce(schedule, '') LIKE '% * * *' THEN '1d'
  WHEN coalesce(schedule, '') LIKE '% * * %' THEN '1w'
  ELSE 'once'
END;
