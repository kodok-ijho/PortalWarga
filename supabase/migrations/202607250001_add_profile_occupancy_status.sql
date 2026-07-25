alter table public.profiles
  add column if not exists occupancy_status public.occupancy_status;

