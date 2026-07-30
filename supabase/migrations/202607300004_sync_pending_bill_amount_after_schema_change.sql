-- Keep unpaid bills aligned with the IPL schema assigned to their unit.
-- Completed/paid bills remain historical snapshots and are not changed.

create or replace function public.sync_unit_ipl_bill_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  schema_amount numeric;
begin
  select sum((component_json ->> 'amount')::numeric)
    into schema_amount
  from public.ipl_settings settings
  cross join lateral jsonb_array_elements(settings.value -> 'schemas') as schema_item(schema_json)
  cross join lateral jsonb_array_elements(schema_item.schema_json -> 'components') as component(component_json)
  where settings.key = 'billing.ipl_schemas'
    and schema_item.schema_json ->> 'id' = new.ipl_schema_id;

  if schema_amount is null then
    return new;
  end if;

  update public.ipl_bills
  set amount = schema_amount,
      updated_at = now()
  where unit_id = new.id
    and status in ('pending', 'overdue')
    and amount is distinct from schema_amount;

  return new;
end;
$$;

drop trigger if exists trg_units_sync_ipl_bill_amount on public.units;
create trigger trg_units_sync_ipl_bill_amount
  after update of ipl_schema_id on public.units
  for each row
  when (old.ipl_schema_id is distinct from new.ipl_schema_id)
  execute function public.sync_unit_ipl_bill_amount();

-- Repair existing unpaid bills after the schema column was introduced.
with bill_amounts as (
  select
    bills.id,
    sum((component_json ->> 'amount')::numeric) as amount
  from public.ipl_bills bills
  join public.units units on units.id = bills.unit_id
  join public.ipl_settings settings on settings.key = 'billing.ipl_schemas'
  cross join lateral jsonb_array_elements(settings.value -> 'schemas') as schema_item(schema_json)
  cross join lateral jsonb_array_elements(schema_item.schema_json -> 'components') as component(component_json)
  where bills.status in ('pending', 'overdue')
    and schema_item.schema_json ->> 'id' = units.ipl_schema_id
  group by bills.id
)
update public.ipl_bills bills
set amount = bill_amounts.amount,
    updated_at = now()
from bill_amounts
where bills.id = bill_amounts.id
  and bills.amount is distinct from bill_amounts.amount;
