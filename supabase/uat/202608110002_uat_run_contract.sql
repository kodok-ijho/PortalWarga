-- UAT ONLY - DO NOT APPLY TO PRODUCTION.
-- Adds disposable run markers and server-only inventory/cleanup helpers.
-- Apply after 202608110001_uat_safety_overlay.sql on the verified UAT project.

begin;

create table if not exists public.uat_runs (
  id uuid primary key default gen_random_uuid(),
  run_label text not null unique,
  status text not null default 'open' check (status in ('open', 'cleaning', 'closed')),
  is_demo boolean not null default true check (is_demo = true),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.uat_runs enable row level security;
revoke all on public.uat_runs from public, anon, authenticated;
grant select, insert, update, delete on public.uat_runs to service_role;

create or replace function public.assert_uat_environment()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.ipl_settings
    where key = 'uat.environment'
      and value->>'app_env' = 'uat'
      and coalesce((value->>'is_demo')::boolean, false) = true
      and coalesce((value->>'production_data_imported')::boolean, true) = false
  ) then
    raise exception 'UAT environment marker is missing or invalid';
  end if;
end;
$$;

revoke all on function public.assert_uat_environment() from public, anon, authenticated;
grant execute on function public.assert_uat_environment() to service_role;

do $$
declare
  table_name text;
  constraint_name text;
  marker_tables text[] := array[
    'units',
    'profiles',
    'ipl_components',
    'ipl_bills',
    'payments',
    'expenses',
    'audit_logs',
    'events',
    'rsvp',
    'forum_threads',
    'forum_posts',
    'event_members',
    'non_ipl_incomes',
    'email_notification_outbox',
    'email_notification_attempts',
    'email_notification_runs',
    'email_notification_replays',
    'email_notification_capture_anomalies',
    'email_notification_incidents'
  ];
begin
  foreach table_name in array marker_tables loop
    execute format(
      'alter table public.%I add column if not exists uat_run_id uuid, add column if not exists is_demo boolean not null default false',
      table_name
    );

    constraint_name := table_name || '_uat_run_id_fkey';
    if not exists (
      select 1
      from pg_constraint
      where conname = constraint_name
        and conrelid = format('public.%I', table_name)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (uat_run_id) references public.uat_runs(id) on delete restrict',
        table_name,
        constraint_name
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (uat_run_id) where uat_run_id is not null',
      'idx_' || table_name || '_uat_run_id',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.validate_uat_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_demo is distinct from (new.uat_run_id is not null) then
    raise exception 'is_demo and uat_run_id must be set together';
  end if;

  if tg_op = 'UPDATE' and (
    new.uat_run_id is distinct from old.uat_run_id
    or new.is_demo is distinct from old.is_demo
  ) then
    raise exception 'UAT marker is immutable';
  end if;

  if new.uat_run_id is not null and not exists (
    select 1
    from public.uat_runs
    where id = new.uat_run_id
      and status = 'open'
      and is_demo = true
  ) then
    raise exception 'UAT run is not open';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_uat_marker() from public, anon, authenticated;

create or replace function public.propagate_email_uat_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_run_id uuid;
  parsed_run_id text;
begin
  if new.uat_run_id is not null then
    return new;
  end if;

  if tg_table_name = 'email_notification_outbox' then
    if new.entity_type = 'profile' then
      select uat_run_id into source_run_id
      from public.profiles
      where id = new.entity_id and is_demo = true;
    elsif new.entity_type = 'payment' then
      select uat_run_id into source_run_id
      from public.payments
      where id = new.entity_id and is_demo = true;
    end if;
  elsif tg_table_name in ('email_notification_attempts', 'email_notification_replays') then
    select uat_run_id into source_run_id
    from public.email_notification_outbox
    where id = new.outbox_id and is_demo = true;
  elsif tg_table_name = 'email_notification_capture_anomalies' then
    if new.entity_type = 'profile' then
      select uat_run_id into source_run_id
      from public.profiles
      where id = new.entity_id and is_demo = true;
    elsif new.entity_type = 'payment' then
      select uat_run_id into source_run_id
      from public.payments
      where id = new.entity_id and is_demo = true;
    end if;
  elsif tg_table_name = 'email_notification_runs' then
    parsed_run_id := substring(new.component from '^uat:([0-9a-fA-F-]{36}):');
  elsif tg_table_name = 'email_notification_incidents' then
    parsed_run_id := substring(new.incident_key from '^uat:([0-9a-fA-F-]{36}):');
  end if;

  if source_run_id is null and parsed_run_id is not null then
    begin
      source_run_id := parsed_run_id::uuid;
    exception when invalid_text_representation then
      source_run_id := null;
    end;
  end if;

  if source_run_id is not null then
    new.uat_run_id := source_run_id;
    new.is_demo := true;
  end if;
  return new;
end;
$$;

revoke all on function public.propagate_email_uat_marker() from public, anon, authenticated;

do $$
declare
  table_name text;
  email_tables text[] := array[
    'email_notification_outbox', 'email_notification_attempts',
    'email_notification_replays', 'email_notification_capture_anomalies',
    'email_notification_runs', 'email_notification_incidents'
  ];
begin
  foreach table_name in array email_tables loop
    execute format('drop trigger if exists trg_00_propagate_uat_marker on public.%I', table_name);
    execute format(
      'create trigger trg_00_propagate_uat_marker before insert or update on public.%I for each row execute function public.propagate_email_uat_marker()',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
  marker_tables text[] := array[
    'units', 'profiles', 'ipl_components', 'ipl_bills', 'payments',
    'expenses', 'audit_logs', 'events', 'rsvp', 'forum_threads',
    'forum_posts', 'event_members', 'non_ipl_incomes',
    'email_notification_outbox', 'email_notification_attempts',
    'email_notification_runs', 'email_notification_replays',
    'email_notification_capture_anomalies', 'email_notification_incidents'
  ];
begin
  foreach table_name in array marker_tables loop
    execute format('drop trigger if exists trg_validate_uat_marker on public.%I', table_name);
    execute format(
      'create trigger trg_validate_uat_marker before insert or update on public.%I for each row execute function public.validate_uat_marker()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.create_uat_run(p_run_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id uuid;
begin
  perform public.assert_uat_environment();

  if nullif(btrim(coalesce(p_run_label, '')), '') is null
     or p_run_label !~ '^WUAT-[0-9]{8}-[A-Za-z0-9_-]{4,64}$' then
    raise exception 'Invalid UAT run label';
  end if;

  insert into public.uat_runs (run_label)
  values (p_run_label)
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_uat_run(text) from public, anon, authenticated;
grant execute on function public.create_uat_run(text) to service_role;

create or replace function public.inventory_uat_run(p_run_id uuid)
returns table(entity text, row_count bigint)
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  table_name text;
  counted bigint;
  marker_tables text[] := array[
    'units', 'profiles', 'ipl_components', 'ipl_bills', 'payments',
    'expenses', 'audit_logs', 'events', 'rsvp', 'forum_threads',
    'forum_posts', 'event_members', 'non_ipl_incomes',
    'email_notification_outbox', 'email_notification_attempts',
    'email_notification_runs', 'email_notification_replays',
    'email_notification_capture_anomalies', 'email_notification_incidents'
  ];
begin
  perform public.assert_uat_environment();

  foreach table_name in array marker_tables loop
    execute format(
      'select count(*)::bigint from public.%I where uat_run_id = $1 and is_demo = true',
      table_name
    ) into counted using p_run_id;
    entity := 'public.' || table_name;
    row_count := counted;
    return next;
  end loop;

  entity := 'storage.objects';
  select count(*)::bigint into row_count
  from storage.objects
  where name like 'uat/' || p_run_id::text || '/%';
  return next;

  entity := 'auth.users';
  select count(distinct auth_user.id)::bigint into row_count
  from auth.users auth_user
  join public.profiles profile
    on lower(profile.email) = lower(auth_user.email)
  where profile.uat_run_id = p_run_id
    and profile.is_demo = true;
  return next;

  entity := 'public.uat_runs';
  select count(*)::bigint into row_count
  from public.uat_runs
  where id = p_run_id;
  return next;
end;
$$;

revoke all on function public.inventory_uat_run(uuid) from public, anon, authenticated;
grant execute on function public.inventory_uat_run(uuid) to service_role;

create or replace function public.cleanup_uat_run(p_run_id uuid, p_confirmation text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, storage
as $$
begin
  perform public.assert_uat_environment();

  if p_confirmation is distinct from 'DELETE UAT ' || p_run_id::text then
    raise exception 'Cleanup confirmation mismatch';
  end if;

  if not exists (
    select 1 from public.uat_runs
    where id = p_run_id and is_demo = true and status in ('open', 'cleaning')
  ) then
    raise exception 'UAT run not found or not cleanable';
  end if;

  if exists (
    select 1 from storage.objects
    where name like 'uat/' || p_run_id::text || '/%'
  ) then
    raise exception 'Delete UAT storage objects through the Storage API before database cleanup';
  end if;

  if exists (
    select 1
    from auth.users auth_user
    join public.profiles profile
      on lower(profile.email) = lower(auth_user.email)
    where profile.uat_run_id = p_run_id and profile.is_demo = true
  ) then
    raise exception 'Delete UAT auth identities through the Auth Admin API before database cleanup';
  end if;

  update public.uat_runs set status = 'cleaning' where id = p_run_id;

  delete from public.email_notification_attempts where uat_run_id = p_run_id and is_demo = true;
  delete from public.email_notification_replays where uat_run_id = p_run_id and is_demo = true;
  delete from public.email_notification_capture_anomalies where uat_run_id = p_run_id and is_demo = true;
  delete from public.email_notification_outbox where uat_run_id = p_run_id and is_demo = true;
  delete from public.email_notification_runs where uat_run_id = p_run_id and is_demo = true;
  delete from public.email_notification_incidents where uat_run_id = p_run_id and is_demo = true;
  delete from public.audit_logs where uat_run_id = p_run_id and is_demo = true;
  delete from public.forum_posts where uat_run_id = p_run_id and is_demo = true;
  delete from public.forum_threads where uat_run_id = p_run_id and is_demo = true;
  delete from public.rsvp where uat_run_id = p_run_id and is_demo = true;
  delete from public.event_members where uat_run_id = p_run_id and is_demo = true;
  delete from public.non_ipl_incomes where uat_run_id = p_run_id and is_demo = true;
  delete from public.expenses where uat_run_id = p_run_id and is_demo = true;

  update public.ipl_bills
  set payment_id = null
  where uat_run_id = p_run_id and is_demo = true;

  delete from public.payments where uat_run_id = p_run_id and is_demo = true;
  delete from public.ipl_bills where uat_run_id = p_run_id and is_demo = true;
  delete from public.ipl_components where uat_run_id = p_run_id and is_demo = true;
  delete from public.events where uat_run_id = p_run_id and is_demo = true;
  delete from public.profiles where uat_run_id = p_run_id and is_demo = true;
  delete from public.units where uat_run_id = p_run_id and is_demo = true;

  update public.uat_runs
  set status = 'closed', closed_at = now()
  where id = p_run_id;

  delete from public.uat_runs where id = p_run_id;
  return true;
end;
$$;

revoke all on function public.cleanup_uat_run(uuid, text) from public, anon, authenticated;
grant execute on function public.cleanup_uat_run(uuid, text) to service_role;

commit;
