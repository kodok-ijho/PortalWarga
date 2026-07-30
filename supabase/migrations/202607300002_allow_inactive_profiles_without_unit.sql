-- Allow deactivated approved warga profiles to be unassigned from a unit.
-- Active approved warga profiles must still have a unit assignment.

alter table public.profiles
  drop constraint if exists profiles_approved_warga_has_unit;

alter table public.profiles
  add constraint profiles_approved_warga_has_unit check (
    approval_status <> 'approved'
    or role <> 'warga'
    or unit_id is not null
    or is_active = false
  );
