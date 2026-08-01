-- Trigger functions are internal database plumbing and must not be callable
-- directly through PostgREST RPC by anonymous or authenticated clients.

revoke execute on function public.normalize_qris_payment_metadata()
  from public, anon, authenticated;

revoke execute on function public.validate_qris_payment_write()
  from public, anon, authenticated;

revoke execute on function public.sync_qris_payment_bill()
  from public, anon, authenticated;
