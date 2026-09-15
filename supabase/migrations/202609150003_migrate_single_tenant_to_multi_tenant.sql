-- =====================================================================
-- Migration: Script Migrasi Single-Tenant PortalWarga ke Multi-Tenant RuangWarga
-- Task: T11.4 (Ref: requirement.md FR-0, specification.md §2, §3, §4, §10, docs/audit-notes.md)
-- Date: 2026-09-15
-- =====================================================================
-- Deskripsi:
-- Fungsi stored procedure `migrate_legacy_portal_warga` untuk memigrasi
-- instance PortalWarga single-tenant (lama) ke struktur multi-tenant baru.
--
-- Pemetaan Data:
-- 1. Metadata Perumahan -> `tenants` (type: 'rt_rw') & `tenant_subscriptions`
-- 2. `units` -> `tenant_units` (label gabungan blok/nomor, metadata fleksibel)
-- 3. `profiles` -> `tenant_members` (peran warga -> anggota, status approval)
-- 4. `ipl_components` & `ipl_settings` -> `tenants.settings` (JSONB)
-- 5. `ipl_bills` -> `billing_items` (kategori: ipl, status unpaid/paid/cancelled)
-- 6. `payments` -> update `tenant_id` & `billing_item_id`
-- 7. `expenses` -> update `tenant_id`
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.migrate_legacy_portal_warga(
  p_tenant_name text DEFAULT 'Palm Village RT 05',
  p_owner_email text DEFAULT NULL,
  p_subscription_status text DEFAULT 'active'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_owner_id uuid;
  v_units_migrated integer := 0;
  v_members_migrated integer := 0;
  v_bills_migrated integer := 0;
  v_payments_migrated integer := 0;
  v_expenses_migrated integer := 0;
  v_ipl_components jsonb := '[]'::jsonb;
  v_bank_account jsonb := '{"bank_name": "BCA", "account_number": "8830123456", "account_holder": "Kas RT Palm Village"}'::jsonb;
  v_has_units boolean;
  v_has_profiles boolean;
  v_has_ipl_bills boolean;
BEGIN
  -- 1. Validasi keberadaan tabel legacy di schema
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'units'
  ) INTO v_has_units;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) INTO v_has_profiles;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ipl_bills'
  ) INTO v_has_ipl_bills;

  IF NOT v_has_units OR NOT v_has_profiles THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tabel legacy (units / profiles) tidak ditemukan pada schema aktif. Tidak ada data yang perlu dimigrasikan.',
      'has_legacy_tables', false
    );
  END IF;

  -- 2. Identifikasi Owner Tenant (Ketua RT / Admin)
  IF p_owner_email IS NOT NULL THEN
    EXECUTE 'SELECT id FROM public.profiles WHERE lower(email) = lower($1) LIMIT 1'
    INTO v_owner_id
    USING p_owner_email;
  END IF;

  IF v_owner_id IS NULL THEN
    EXECUTE 'SELECT id FROM public.profiles WHERE role = ''admin'' ORDER BY created_at ASC LIMIT 1'
    INTO v_owner_id;
  END IF;

  IF v_owner_id IS NULL THEN
    EXECUTE 'SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1'
    INTO v_owner_id;
  END IF;

  IF v_owner_id IS NULL THEN
    v_owner_id := gen_random_uuid();
  END IF;

  -- 3. Kumpulkan komponen IPL lama jika tabel ipl_components tersedia
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ipl_components') THEN
    EXECUTE '
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          ''name'', name,
          ''amount'', amount
        ) ORDER BY sort_order ASC
      ), ''[]''::jsonb)
      FROM public.ipl_components
      WHERE is_active = true
    ' INTO v_ipl_components;
  END IF;

  IF jsonb_array_length(v_ipl_components) = 0 THEN
    v_ipl_components := '[
      {"name": "Keamanan", "amount": 80000},
      {"name": "Kebersihan", "amount": 30000},
      {"name": "Kas RT", "amount": 20000},
      {"name": "DDC (Sosial)", "amount": 10000}
    ]'::jsonb;
  END IF;

  -- 4. Ambil setting bank account jika tersedia di ipl_settings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ipl_settings') THEN
    BEGIN
      EXECUTE 'SELECT value FROM public.ipl_settings WHERE key = ''bank_account'' LIMIT 1'
      INTO v_bank_account;
    EXCEPTION WHEN OTHERS THEN
      -- Abaikan error dan gunakan default
    END;
  END IF;

  -- 5. Buat atau Temukan Tenant di tabel public.tenants
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE name = p_tenant_name
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (
      name,
      type,
      owner_id,
      address,
      contact_phone,
      settings
    ) VALUES (
      p_tenant_name,
      'rt_rw'::public.tenant_type,
      v_owner_id,
      'Jl. Boulevard Palm Village',
      '081234567890',
      jsonb_build_object(
        'ipl_components', v_ipl_components,
        'due_day', 10,
        'bank_account', v_bank_account,
        'invite_code', 'RW-PALM-MIGRATED',
        'onboarding_completed', true,
        'legacy_migrated', true,
        'migrated_at', now()
      )
    ) RETURNING id INTO v_tenant_id;
  END IF;

  -- 6. Buat Subscription aktif di public.tenant_subscriptions jika belum ada
  IF NOT EXISTS (SELECT 1 FROM public.tenant_subscriptions WHERE tenant_id = v_tenant_id) THEN
    INSERT INTO public.tenant_subscriptions (
      tenant_id,
      status,
      current_period_start,
      current_period_end
    ) VALUES (
      v_tenant_id,
      p_subscription_status::public.subscription_status,
      now(),
      now() + interval '1 year'
    );
  END IF;

  -- 7. Migrasi Units -> tenant_units
  -- Simpan mapping sementara di tabel temporer
  CREATE TEMP TABLE temp_unit_mapping (
    legacy_unit_id bigint PRIMARY KEY,
    new_unit_id bigint
  ) ON COMMIT DROP;

  EXECUTE '
    INSERT INTO public.tenant_units (
      tenant_id,
      label,
      status,
      metadata
    )
    SELECT
      $1 AS tenant_id,
      trim(block || ''/'' || unit_number) AS label,
      CASE WHEN is_occupied THEN ''occupied'' ELSE ''vacant'' END AS status,
      jsonb_build_object(
        ''legacy_id'', id,
        ''block'', block,
        ''unit_number'', unit_number,
        ''floor'', floor,
        ''size'', size,
        ''occupancy_status'', occupancy_status,
        ''notes'', notes
      ) AS metadata
    FROM public.units u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_units tu
      WHERE tu.tenant_id = $1
        AND tu.metadata->>''legacy_id'' = u.id::text
    )
    RETURNING (metadata->>''legacy_id'')::bigint, id
  '
  INTO v_units_migrated;

  -- 8. Migrasi Profiles -> tenant_members
  CREATE TEMP TABLE temp_member_mapping (
    legacy_profile_id uuid PRIMARY KEY,
    new_member_id uuid
  ) ON COMMIT DROP;

  EXECUTE '
    INSERT INTO public.tenant_members (
      tenant_id,
      user_id,
      unit_id,
      full_name,
      phone,
      role,
      status,
      occupancy_status
    )
    SELECT
      $1 AS tenant_id,
      p.id AS user_id,
      tu.id AS unit_id,
      p.full_name,
      p.phone,
      CASE 
        WHEN p.role = ''admin'' THEN ''admin''
        WHEN p.role = ''bendahara'' THEN ''bendahara''
        WHEN p.role = ''pengurus'' THEN ''pengurus''
        ELSE ''anggota''
      END AS role,
      CASE 
        WHEN p.approval_status = ''approved'' THEN ''approved''
        WHEN p.approval_status = ''rejected'' THEN ''rejected''
        ELSE ''pending''
      END AS status,
      coalesce(p.occupancy_status::text, ''owner_occupied'') AS occupancy_status
    FROM public.profiles p
    LEFT JOIN public.tenant_units tu 
      ON tu.tenant_id = $1 
     AND tu.metadata->>''legacy_id'' = p.unit_id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = $1
        AND tm.user_id = p.id
    )
  '
  USING v_tenant_id;

  GET DIAGNOSTICS v_members_migrated = ROW_COUNT;

  -- 9. Migrasi ipl_bills -> billing_items
  IF v_has_ipl_bills THEN
    EXECUTE '
      INSERT INTO public.billing_items (
        tenant_id,
        unit_id,
        member_id,
        period,
        amount,
        late_fee,
        due_date,
        status,
        metadata
      )
      SELECT
        $1 AS tenant_id,
        tu.id AS unit_id,
        tm.id AS member_id,
        b.period,
        b.amount,
        coalesce(b.late_fee, 0),
        b.due_date,
        CASE 
          WHEN b.status = ''paid'' THEN ''paid''
          WHEN b.status = ''cancelled'' THEN ''cancelled''
          ELSE ''unpaid''
        END AS status,
        jsonb_build_object(
          ''legacy_bill_id'', b.id,
          ''bill_type'', ''ipl'',
          ''notes'', b.notes
        ) AS metadata
      FROM public.ipl_bills b
      JOIN public.tenant_units tu 
        ON tu.tenant_id = $1 
       AND tu.metadata->>''legacy_id'' = b.unit_id::text
      LEFT JOIN public.tenant_members tm 
        ON tm.tenant_id = $1 
       AND tm.user_id = b.resident_id
      WHERE NOT EXISTS (
        SELECT 1 FROM public.billing_items bi
        WHERE bi.tenant_id = $1
          AND bi.metadata->>''legacy_bill_id'' = b.id::text
      )
    '
    USING v_tenant_id;

    GET DIAGNOSTICS v_bills_migrated = ROW_COUNT;
  END IF;

  -- 10. Hubungkan payments yang belum memiliki tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
    EXECUTE '
      UPDATE public.payments p
      SET tenant_id = $1,
          billing_item_id = bi.id
      FROM public.billing_items bi
      WHERE p.tenant_id IS NULL
        AND bi.tenant_id = $1
        AND p.ipl_bill_id IS NOT NULL
        AND bi.metadata->>''legacy_bill_id'' = p.ipl_bill_id::text
    '
    USING v_tenant_id;

    GET DIAGNOSTICS v_payments_migrated = ROW_COUNT;
  END IF;

  -- 11. Hubungkan expenses yang belum memiliki tenant_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    EXECUTE '
      UPDATE public.expenses
      SET tenant_id = $1
      WHERE tenant_id IS NULL
    '
    USING v_tenant_id;

    GET DIAGNOSTICS v_expenses_migrated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', p_tenant_name,
    'owner_id', v_owner_id,
    'has_legacy_tables', true,
    'units_migrated', v_units_migrated,
    'members_migrated', v_members_migrated,
    'bills_migrated', v_bills_migrated,
    'payments_linked', v_payments_migrated,
    'expenses_linked', v_expenses_migrated,
    'migrated_at', now()
  );
END;
$$;

-- Berikan hak eksekusi hanya kepada service_role dan platform admin
REVOKE ALL ON FUNCTION public.migrate_legacy_portal_warga(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_portal_warga(text, text, text) TO service_role;

COMMIT;

-- =====================================================================
-- ROLLBACK / CARA PENGGUNAAN:
-- ---------------------------------------------------------------------
-- Untuk menjalankan migrasi:
--   SELECT public.migrate_legacy_portal_warga(
--     'Palm Village RT 05',
--     'admin@palmvillage.id',
--     'active'
--   );
--
-- Untuk rollback function:
--   DROP FUNCTION IF EXISTS public.migrate_legacy_portal_warga(text, text, text);
-- =====================================================================
