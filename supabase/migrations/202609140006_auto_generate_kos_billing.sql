-- Migration: Auto-generate recurring rental billing items for kos tenants with active contracts
-- Task: T7.3 (Ref: requirement.md FR-17, specification.md §3, §6)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- 1. FUNCTION public.auto_generate_kos_billing
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_generate_kos_billing(
  p_period TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_tenant RECORD;
  v_unit RECORD;
  v_member_id UUID;
  v_amount NUMERIC(12,2);
  v_due_date DATE;
  v_due_day INT;
  v_period_year INT;
  v_period_month INT;
  v_contract_start DATE;
  v_contract_end DATE;
  v_generated_count INT := 0;
  v_skipped_count INT := 0;
  v_items JSONB := '[]'::jsonb;
  v_item_id UUID;
  v_days_in_month INT;
  v_clamped_due_day INT;
  v_is_readonly BOOLEAN := FALSE;
BEGIN
  -- Validasi format periode 'YYYY-MM'
  IF p_period IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Format periode tidak valid. Gunakan format YYYY-MM';
  END IF;

  v_caller_auth_id := auth.uid();

  -- Cek autorisasi jika dipanggil oleh authenticated user (bukan service role / postgres)
  IF v_caller_auth_id IS NOT NULL THEN
    IF NOT public.is_platform_admin() THEN
      IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna non-platform admin wajib menyertakan tenant_id';
      END IF;

      IF NOT public.is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Hanya admin atau pengurus tenant yang berhak membuat tagihan sewa';
      END IF;
    END IF;
  END IF;

  v_period_year := split_part(p_period, '-', 1)::INT;
  v_period_month := split_part(p_period, '-', 2)::INT;

  IF v_period_month < 1 OR v_period_month > 12 THEN
    RAISE EXCEPTION 'Bulan periode tidak valid: %', v_period_month;
  END IF;

  -- Hitung jumlah hari dalam bulan tersebut
  v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', make_date(v_period_year, v_period_month, 1)) + interval '1 month' - interval '1 day'))::INT;

  -- Iterasi tenant bertipe 'kos'
  FOR v_tenant IN
    SELECT t.id, t.name, t.settings
    FROM public.tenants t
    WHERE t.type = 'kos'
      AND (p_tenant_id IS NULL OR t.id = p_tenant_id)
  LOOP
    -- Periksa subscription status tenant. Jika read_only, jangan generate
    BEGIN
      v_is_readonly := public.tenant_subscription_status(v_tenant.id);
    EXCEPTION WHEN OTHERS THEN
      v_is_readonly := FALSE;
    END;

    IF v_is_readonly THEN
      -- Tenant dalam masa read-only karena subscription kadaluarsa
      CONTINUE;
    END IF;

    -- Tentukan tanggal jatuh tempo dari settings tenant (default tgl 5)
    v_due_day := COALESCE(
      (v_tenant.settings->>'billing_due_day')::INT,
      (v_tenant.settings->>'due_day')::INT,
      5
    );
    v_clamped_due_day := LEAST(GREATEST(v_due_day, 1), v_days_in_month);
    v_due_date := make_date(v_period_year, v_period_month, v_clamped_due_day);

    -- Iterasi unit/kamar dengan status 'occupied'
    FOR v_unit IN
      SELECT u.id, u.label, u.metadata
      FROM public.tenant_units u
      WHERE u.tenant_id = v_tenant.id
        AND u.status = 'occupied'
    LOOP
      -- Ambil rentang kontrak sewa dari metadata kamar
      IF (v_unit.metadata ? 'contract_start') AND (v_unit.metadata ? 'contract_end') THEN
        BEGIN
          v_contract_start := (v_unit.metadata->>'contract_start')::DATE;
          v_contract_end := (v_unit.metadata->>'contract_end')::DATE;
        EXCEPTION WHEN OTHERS THEN
          v_contract_start := NULL;
          v_contract_end := NULL;
        END;
      ELSE
        v_contract_start := NULL;
        v_contract_end := NULL;
      END IF;

      -- Tagihan hanya di-generate jika kontrak aktif mencakup periode p_period
      IF v_contract_start IS NOT NULL AND v_contract_end IS NOT NULL
         AND to_char(v_contract_start, 'YYYY-MM') <= p_period
         AND to_char(v_contract_end, 'YYYY-MM') >= p_period THEN

        -- Cek apakah tagihan untuk unit ini pada periode ini sudah ada
        IF EXISTS (
          SELECT 1 FROM public.billing_items b
          WHERE b.tenant_id = v_tenant.id
            AND b.unit_id = v_unit.id
            AND b.period = p_period
        ) THEN
          v_skipped_count := v_skipped_count + 1;
        ELSE
          -- Ambil harga sewa
          v_amount := COALESCE(
            (v_unit.metadata->>'rent_price')::NUMERIC,
            (v_unit.metadata->>'default_rent_price')::NUMERIC,
            (v_tenant.settings->>'default_rent_price')::NUMERIC,
            0
          );

          -- Cari penyewa yang menempati unit
          v_member_id := NULL;
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
            WHERE tm.tenant_id = v_tenant.id
              AND tm.unit_id = v_unit.id
              AND tm.status = 'approved'
            LIMIT 1;
          END IF;

          -- Masukkan tagihan sewa baru
          INSERT INTO public.billing_items (
            tenant_id,
            unit_id,
            member_id,
            period,
            amount,
            late_fee,
            due_date,
            status,
            contract_start,
            contract_end,
            metadata
          ) VALUES (
            v_tenant.id,
            v_unit.id,
            v_member_id,
            p_period,
            v_amount,
            0,
            v_due_date,
            'unpaid',
            v_contract_start,
            v_contract_end,
            jsonb_build_object(
              'billing_type', 'rent',
              'auto_generated', true,
              'room_label', v_unit.label,
              'generated_at', now()
            )
          )
          RETURNING id INTO v_item_id;

          v_generated_count := v_generated_count + 1;
          v_items := v_items || jsonb_build_object(
            'id', v_item_id,
            'tenant_id', v_tenant.id,
            'unit_id', v_unit.id,
            'unit_label', v_unit.label,
            'period', p_period,
            'amount', v_amount
          );
        END IF;
      ELSE
        -- Kamar tidak memiliki kontrak aktif pada periode ini
        v_skipped_count := v_skipped_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', p_period,
    'generated_count', v_generated_count,
    'skipped_count', v_skipped_count,
    'items', v_items
  );
END;
$$;

-- Berikan hak akses eksekusi ke authenticated dan service_role
REVOKE ALL ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_generate_kos_billing(TEXT, UUID) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.auto_generate_kos_billing(TEXT, UUID);
