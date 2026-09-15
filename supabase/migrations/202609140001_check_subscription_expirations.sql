-- Migration: Check subscription expirations (Trial & Active to Read-Only)
-- Task: T4.6 (Ref: requirement.md FR-7, FR-12, FR-13; specification.md §2)
-- Date: 2026-09-14

BEGIN;

-- 1. Fungsi check_subscription_expirations() (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_subscription_expirations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_count INTEGER := 0;
  v_active_count INTEGER := 0;
BEGIN
  -- 1. Transisi trial yang melewati batas trial_ends_at menjadi read_only
  WITH expired_trials AS (
    UPDATE public.tenant_subscriptions
    SET status = 'read_only',
        updated_at = now()
    WHERE status = 'trial'
      AND trial_ends_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_trial_count FROM expired_trials;

  -- 2. Transisi active yang melewati current_period_end menjadi read_only
  WITH expired_actives AS (
    UPDATE public.tenant_subscriptions
    SET status = 'read_only',
        updated_at = now()
    WHERE status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end < now()
    RETURNING id
  )
  SELECT count(*) INTO v_active_count FROM expired_actives;

  RETURN (v_trial_count + v_active_count);
END;
$$;

-- Berikan hak eksekusi ke authenticated dan service_role
GRANT EXECUTE ON FUNCTION public.check_subscription_expirations() TO authenticated, service_role;

-- 2. Fungsi helper RPC untuk verifikasi pembayaran dan aktivasi subscription (dipanggil webhook / edge function)
CREATE OR REPLACE FUNCTION public.activate_tenant_subscription(
  p_payment_id UUID,
  p_gateway_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_subscription RECORD;
  v_period RECORD;
  v_new_end TIMESTAMPTZ;
BEGIN
  -- Ambil record pembayaran
  SELECT * INTO v_payment
  FROM public.subscription_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- Idempotency check: jika sudah settled, kembalikan success
  IF v_payment.status = 'settled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Payment already settled');
  END IF;

  -- Ambil data periode langganan
  SELECT * INTO v_period
  FROM public.subscription_periods
  WHERE id = v_payment.period_id;

  -- Hitung masa berlaku baru (jika saat ini masih aktif dan belum expired, perpanjang dari current_period_end)
  SELECT * INTO v_subscription
  FROM public.tenant_subscriptions
  WHERE id = v_payment.subscription_id;

  IF v_subscription.status = 'active' AND v_subscription.current_period_end > now() THEN
    v_new_end := v_subscription.current_period_end + (v_period.duration_months || ' months')::interval;
  ELSE
    v_new_end := now() + (v_period.duration_months || ' months')::interval;
  END IF;

  -- 1. Update subscription_payments
  UPDATE public.subscription_payments
  SET status = 'settled',
      paid_at = now(),
      payment_gateway_ref = COALESCE(p_gateway_ref, payment_gateway_ref),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 2. Update tenant_subscriptions
  UPDATE public.tenant_subscriptions
  SET status = 'active',
      period_id = v_payment.period_id,
      current_period_start = now(),
      current_period_end = v_new_end,
      updated_at = now()
  WHERE id = v_payment.subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_payment.subscription_id,
    'status', 'active',
    'current_period_end', v_new_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_tenant_subscription(UUID, TEXT) TO service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.activate_tenant_subscription(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.check_subscription_expirations();
