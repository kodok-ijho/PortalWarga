-- Migration: Checkout function for kos rooms (set vacant, clear active contract, unassign member)
-- Task: T7.4 (Ref: requirement.md FR-17, specification.md §3, §4)
-- Date: 2026-09-14

BEGIN;

CREATE OR REPLACE FUNCTION public.checkout_kos_room(
  p_tenant_id UUID,
  p_unit_id BIGINT,
  p_checkout_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL,
  p_cancel_future_bills BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_unit RECORD;
  v_member_id UUID;
  v_cancelled_bills_count INT := 0;
  v_checkout_period TEXT;
  v_updated_metadata JSONB;
BEGIN
  v_caller_auth_id := auth.uid();

  -- Cek autorisasi jika dipanggil oleh authenticated user
  IF v_caller_auth_id IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF NOT public.is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Hanya admin atau pengurus tenant yang berhak melakukan checkout kamar';
      END IF;
    END IF;
  END IF;

  -- Validasi keberadaan kamar dan kepemilikan tenant
  SELECT u.id, u.tenant_id, u.label, u.status, u.metadata
  INTO v_unit
  FROM public.tenant_units u
  WHERE u.id = p_unit_id AND u.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar/unit tidak ditemukan pada tenant ini';
  END IF;

  -- Ambil penyewa yang terikat
  IF (v_unit.metadata ? 'tenant_member_id') AND (v_unit.metadata->>'tenant_member_id') IS NOT NULL AND (v_unit.metadata->>'tenant_member_id') != '' THEN
    BEGIN
      v_member_id := (v_unit.metadata->>'tenant_member_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_member_id := NULL;
    END;
  END IF;

  IF v_member_id IS NULL THEN
    SELECT tm.id INTO v_member_id
    FROM public.tenant_members tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.unit_id = p_unit_id
      AND tm.status = 'approved'
    LIMIT 1;
  END IF;

  v_checkout_period := to_char(p_checkout_date, 'YYYY-MM');

  -- Siapkan metadata riwayat checkout dan bersihkan kontrak aktif
  v_updated_metadata := v_unit.metadata || jsonb_build_object(
    'last_checkout', jsonb_build_object(
      'checkout_date', p_checkout_date,
      'reason', COALESCE(p_reason, 'Checkout penyewa'),
      'checked_out_at', now(),
      'previous_member_id', v_member_id,
      'previous_contract_start', v_unit.metadata->>'contract_start',
      'previous_contract_end', v_unit.metadata->>'contract_end'
    )
  );

  -- Hapus field kontrak aktif agar auto-generate tagihan otomatis berhenti
  v_updated_metadata := v_updated_metadata - 'contract_start' - 'contract_end' - 'tenant_member_id' - 'notes';

  -- 1. Update status unit menjadi 'vacant'
  UPDATE public.tenant_units
  SET status = 'vacant',
      metadata = v_updated_metadata,
      updated_at = now()
  WHERE id = p_unit_id;

  -- 2. Lepaskan ikatan unit pada anggota tenant (penyewa)
  IF v_member_id IS NOT NULL THEN
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE id = v_member_id;
  ELSE
    -- Lepaskan semua member yang masih terikat ke unit ini
    UPDATE public.tenant_members
    SET unit_id = NULL,
        occupancy_status = 'checkout',
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND unit_id = p_unit_id;
  END IF;

  -- 3. Batalkan tagihan belum bayar di masa depan setelah periode checkout jika p_cancel_future_bills true
  IF p_cancel_future_bills THEN
    WITH cancelled AS (
      UPDATE public.billing_items
      SET status = 'cancelled',
          metadata = metadata || jsonb_build_object(
            'cancelled_reason', 'Checkout kamar lebih awal',
            'cancelled_at', now()
          ),
          updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND unit_id = p_unit_id
        AND status = 'unpaid'
        AND period > v_checkout_period
      RETURNING id
    )
    SELECT count(*) INTO v_cancelled_bills_count FROM cancelled;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'unit_id', p_unit_id,
    'unit_label', v_unit.label,
    'status', 'vacant',
    'checkout_date', p_checkout_date,
    'cancelled_future_bills', v_cancelled_bills_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.checkout_kos_room(UUID, BIGINT, DATE, TEXT, BOOLEAN);
