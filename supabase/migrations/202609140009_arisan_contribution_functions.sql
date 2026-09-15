-- Migration: Arisan contribution generation and readiness check functions
-- Task: T8.4 (Ref: requirement.md FR-18, specification.md §3 & §5)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- 1. FUNGSI: generate_arisan_round_bills
-- Menghasilkan tagihan iuran kontribusi serentak untuk seluruh peserta putaran arisan
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_arisan_round_bills(
  p_tenant_id uuid,
  p_round_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_participant record;
  v_settings jsonb;
  v_contribution_amount numeric;
  v_total_generated integer := 0;
  v_total_skipped integer := 0;
  v_due_date date;
BEGIN
  -- 1. Verifikasi subscription status bukan read_only
  IF public.tenant_subscription_status(p_tenant_id) = 'read_only' THEN
    RAISE EXCEPTION 'Operasi diblokir: Tenant dalam status read_only. Perpanjang langganan terlebih dahulu.';
  END IF;

  -- 2. Ambil data putaran arisan
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Putaran arisan dengan ID % tidak ditemukan pada tenant ini.', p_round_id;
  END IF;

  -- 3. Ambil setting iuran arisan
  SELECT settings INTO v_settings
  FROM public.tenants
  WHERE id = p_tenant_id;

  v_contribution_amount := COALESCE(
    (v_settings->>'contribution_amount')::numeric,
    CASE 
      WHEN (v_settings->>'slot_count')::int > 0 AND v_round.total_pool_amount > 0 
      THEN v_round.total_pool_amount / (v_settings->>'slot_count')::int
      ELSE 300000 
    END
  );

  -- Tentukan due date default (akhir bulan atau 7 hari dari sekarang jika null)
  v_due_date := COALESCE(p_due_date, CURRENT_DATE + interval '14 days');

  -- 4. Iterasi seluruh peserta arisan
  FOR v_participant IN 
    SELECT ap.member_id, ap.unit_slot_id
    FROM public.arisan_participants ap
    JOIN public.tenant_members tm ON tm.id = ap.member_id
    WHERE ap.tenant_id = p_tenant_id 
      AND tm.status = 'approved'
  LOOP
    -- Periksa apakah sudah ada tagihan untuk member & putaran ini
    IF EXISTS (
      SELECT 1 FROM public.billing_items
      WHERE tenant_id = p_tenant_id
        AND member_id = v_participant.member_id
        AND (
          (metadata->>'round_id') = p_round_id::text
          OR period = v_round.period
        )
    ) THEN
      v_total_skipped := v_total_skipped + 1;
    ELSE
      -- Buat tagihan iuran kontribusi
      INSERT INTO public.billing_items (
        tenant_id,
        member_id,
        unit_id,
        period,
        amount,
        late_fee,
        due_date,
        status,
        metadata
      ) VALUES (
        p_tenant_id,
        v_participant.member_id,
        v_participant.unit_slot_id,
        v_round.period,
        v_contribution_amount,
        0,
        v_due_date,
        'unpaid',
        jsonb_build_object(
          'type', 'arisan_contribution',
          'round_id', p_round_id,
          'round_number', v_round.round_number,
          'period_label', v_round.period,
          'auto_generated_at', now()
        )
      );

      v_total_generated := v_total_generated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'period', v_round.period,
    'contribution_amount', v_contribution_amount,
    'total_generated', v_total_generated,
    'total_skipped', v_total_skipped
  );
END;
$$;

-- ============================================================
-- 2. FUNGSI: check_arisan_round_readiness
-- Mengecek apakah seluruh iuran putaran sudah lunas, dan auto-update status ready_to_draw
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_arisan_round_readiness(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round record;
  v_total_bills integer := 0;
  v_paid_bills integer := 0;
  v_is_ready boolean := false;
BEGIN
  SELECT * INTO v_round
  FROM public.arisan_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Putaran tidak ditemukan');
  END IF;

  -- Jika status sudah drawn atau cancelled, jangan ubah
  IF v_round.status IN ('drawn', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', true,
      'round_id', p_round_id,
      'status', v_round.status,
      'message', 'Putaran sudah berstatus ' || v_round.status
    );
  END IF;

  -- Hitung tagihan untuk putaran ini
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid')
  INTO v_total_bills, v_paid_bills
  FROM public.billing_items
  WHERE tenant_id = v_round.tenant_id
    AND (
      (metadata->>'round_id') = p_round_id::text
      OR period = v_round.period
    );

  -- Siap dikocok jika ada tagihan dan 100% sudah lunas
  IF v_total_bills > 0 AND v_paid_bills = v_total_bills THEN
    v_is_ready := true;
    UPDATE public.arisan_rounds
    SET status = 'ready_to_draw',
        updated_at = now()
    WHERE id = p_round_id;
  ELSIF v_round.status = 'ready_to_draw' AND v_paid_bills < v_total_bills THEN
    -- Kembalikan ke collecting jika ada tagihan yang dibatalkan/unpaid
    UPDATE public.arisan_rounds
    SET status = 'collecting',
        updated_at = now()
    WHERE id = p_round_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', CASE WHEN v_is_ready THEN 'ready_to_draw' ELSE 'collecting' END,
    'total_bills', v_total_bills,
    'paid_bills', v_paid_bills,
    'is_ready_to_draw', v_is_ready
  );
END;
$$;

-- ============================================================
-- 3. TRIGGER: Auto-check readiness saat billing_items putaran diupdate
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_check_arisan_billing_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id text;
BEGIN
  v_round_id := NEW.metadata->>'round_id';
  IF v_round_id IS NOT NULL AND (v_round_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    PERFORM public.check_arisan_round_readiness(v_round_id::uuid);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_items_arisan_readiness ON public.billing_items;
CREATE TRIGGER trg_billing_items_arisan_readiness
AFTER INSERT OR UPDATE OF status ON public.billing_items
FOR EACH ROW
WHEN (NEW.metadata->>'type' = 'arisan_contribution')
EXECUTE FUNCTION public.trg_check_arisan_billing_status();

COMMIT;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_billing_items_arisan_readiness ON public.billing_items;
-- DROP FUNCTION IF EXISTS public.trg_check_arisan_billing_status();
-- DROP FUNCTION IF EXISTS public.check_arisan_round_readiness(uuid);
-- DROP FUNCTION IF EXISTS public.generate_arisan_round_bills(uuid, uuid, date);
