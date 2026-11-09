-- V2 only. No photos, receipt content or keys are stored here.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table private.receipt_scan_limits (
  subject text primary key,
  minute_start timestamptz not null,
  minute_count integer not null default 0,
  day_start timestamptz not null,
  day_count integer not null default 0
);
alter table private.receipt_scan_limits enable row level security;
revoke all on private.receipt_scan_limits from public, anon, authenticated;

create function private.consume_receipt_scan()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_time_utc timestamptz := pg_catalog.clock_timestamp();
  minute_bucket timestamptz := pg_catalog.date_trunc('minute', current_time_utc);
  day_bucket timestamptz := pg_catalog.date_trunc('day', current_time_utc at time zone 'UTC') at time zone 'UTC';
  user_row private.receipt_scan_limits;
  project_row private.receipt_scan_limits;
begin
  if caller is null or not exists (select 1 from public.couple_members where user_id = caller) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  -- One short critical section serializes global and per-user reservations.
  perform pg_catalog.pg_advisory_xact_lock(91006261109::bigint);
  insert into private.receipt_scan_limits(subject, minute_start, day_start)
    values ('project', minute_bucket, day_bucket), (caller::text, minute_bucket, day_bucket)
    on conflict do nothing;
  update private.receipt_scan_limits set
    minute_count = case when minute_start < minute_bucket then 0 else minute_count end,
    day_count = case when day_start < day_bucket then 0 else day_count end,
    minute_start = minute_bucket, day_start = day_bucket
    where subject in ('project', caller::text);
  select * into user_row from private.receipt_scan_limits where subject = caller::text;
  select * into project_row from private.receipt_scan_limits where subject = 'project';
  if user_row.minute_count >= 3 or user_row.day_count >= 20 or project_row.minute_count >= 5 or project_row.day_count >= 50 then return false; end if;
  update private.receipt_scan_limits set minute_count = minute_count + 1, day_count = day_count + 1
    where subject in ('project', caller::text);
  return true;
end;
$$;
revoke all on function private.consume_receipt_scan() from public, anon;
grant execute on function private.consume_receipt_scan() to authenticated;

-- Exposed wrapper is SECURITY INVOKER; privileged work remains private.
create function public.consume_receipt_scan()
returns boolean language sql security invoker set search_path = ''
as $$ select private.consume_receipt_scan(); $$;
revoke all on function public.consume_receipt_scan() from public, anon;
grant execute on function public.consume_receipt_scan() to authenticated;
