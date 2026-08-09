-- Server-side pagination for the admin audit-log page.
-- The function is intentionally restricted to service_role because the caller
-- is the authenticated n8n backend, not the browser.

create or replace function public.admin_list_audit_logs_v1(
  p_action text default null,
  p_search text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with filtered as (
    select
      logs.*,
      coalesce(
        nullif(btrim(profiles.full_name), ''),
        nullif(split_part(coalesce(logs.actor_email, ''), '@', 1), ''),
        'Sistem'
      ) as actor_name
    from public.audit_logs as logs
    left join public.profiles as profiles
      on profiles.id = logs.actor_id
    where
      (nullif(btrim(p_action), '') is null or logs.action = btrim(p_action))
      and (p_date_from is null or logs.created_at >= p_date_from)
      and (p_date_to is null or logs.created_at <= p_date_to)
      and (
        nullif(btrim(p_search), '') is null
        or position(lower(btrim(p_search)) in lower(coalesce(logs.actor_email, ''))) > 0
        or position(lower(btrim(p_search)) in lower(coalesce(profiles.full_name, ''))) > 0
        or position(lower(btrim(p_search)) in lower(coalesce(logs.action, ''))) > 0
        or position(lower(btrim(p_search)) in lower(coalesce(logs.entity_type, ''))) > 0
      )
  ),
  page as (
    select filtered.*
    from filtered
    order by filtered.created_at desc, filtered.id desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'logs', coalesce(
      (
        select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc, page_row.id desc)
        from page as page_row
      ),
      '[]'::jsonb
    ),
    'total_count', (select count(*) from filtered)
  );
$function$;

revoke all on function public.admin_list_audit_logs_v1(
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.admin_list_audit_logs_v1(
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer
) to service_role;
