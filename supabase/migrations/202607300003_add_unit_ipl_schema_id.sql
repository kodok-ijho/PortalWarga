-- Persist the IPL scheme profile selected for each unit.

alter table public.units
  add column if not exists ipl_schema_id text;

update public.units
set ipl_schema_id = case
  when is_occupied then 'schema-komplit'
  else 'schema-basic'
end
where ipl_schema_id is null;

alter table public.units
  alter column ipl_schema_id set default 'schema-basic',
  alter column ipl_schema_id set not null;
