-- Migration: Implement start_new_arisan_cycle RPC
-- Task: T8.7 (Ref: requirement.md FR-18, specification.md §5)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- FUNGSI ATOMIK: start_new_arisan_cycle
-- 1. Validasi subscription status bukan read_only
-- 2. Validasi tenant bertipe 'arisan'
-- 3. Validasi siklus selesai (seluruh peserta has_won = true, kecuali p_force = true)
-- 4. Reset status has_won = false, won_at_round_id = NULL, won_at = NULL pada arisan_participants
-- 5. Perbarui cycle counter pada settings tenant
-- 6. Kembalikan metadata siklus baru
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_new_arisan_cycle(
  p_tenant_id uuid,
  p_operator_member_id uuid DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant record;
  v_remaining_candidates integer := 0;
  v_total_participants integer := 0;
  v_new_cycle integer := 1;
BEGIN
  -- 1. Validasi status subscription gate
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Layanan dalam status read-only. Perpanjang langganan untuk memulai siklus baru.';
  END IF;

  -- 2. Validasi keberadaan tenant dan tipe tenant
  SELECT * INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant dengan ID % tidak ditemukan.', p_tenant_id;
  END IF;

  IF v_tenant.type != 'arisan' THEN
    RAISE EXCEPTION 'Aksi Mulai Siklus Baru hanya valid untuk tenant dengan tipe arisan.';
  END IF;

  -- 3. Cek jumlah peserta yang belum menang
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE has_won = false)
  INTO v_total_participants, v_remaining_candidates
  FROM public.arisan_participants
  WHERE tenant_id = p_tenant_id;

  IF v_total_participants = 0 THEN
    RAISE EXCEPTION 'Belum ada data peserta arisan yang terdaftar pada tenant ini.';
  END IF;

  -- Jika p_force false dan masih ada kandidat belum menang, tolak
  IF NOT p_force AND v_remaining_candidates > 0 THEN
    RAISE EXCEPTION 'Siklus putaran belum selesai. Masih terdapat % peserta yang belum memenangkan undian.', v_remaining_candidates;
  END IF;

  -- 4. Reset seluruh status kemenangan peserta di tabel arisan_participants
  UPDATE public.arisan_participants
  SET 
    has_won = false,
    won_at_round_id = NULL,
    won_at = NULL,
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  -- 5. Naikkan siklus pada settings tenant (current_cycle + 1)
  v_new_cycle := COALESCE((v_tenant.settings->>'current_cycle')::integer, 1) + 1;

  UPDATE public.tenants
  SET 
    settings = jsonb_set(
      COALESCE(settings, '{}'::jsonb),
      '{current_cycle}',
      to_jsonb(v_new_cycle)
    ) || jsonb_build_object(
      'last_cycle_reset_at', now(),
      'last_cycle_reset_by', p_operator_member_id
    ),
    updated_at = now()
  WHERE id = p_tenant_id;

  -- 6. Kembalikan info siklus baru
  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'new_cycle', v_new_cycle,
    'total_participants_reset', v_total_participants,
    'reset_at', now()
  );
END;
$$;

-- Berikan izin eksekusi ke authenticated users (keamanan diatur via SECURITY DEFINER & subscription gate check)
GRANT EXECUTE ON FUNCTION public.start_new_arisan_cycle(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_new_arisan_cycle(uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.start_new_arisan_cycle IS 
  'Mereset status has_won seluruh peserta arisan dan menaikkan current_cycle tenant saat satu siklus undian penuh telah selesai (T8.7).';

COMMIT;
