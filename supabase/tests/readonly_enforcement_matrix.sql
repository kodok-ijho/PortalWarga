-- Test: Read-Only RLS Enforcement Matrix
-- Task: T5.3 (Ref: requirement.md FR-15, specification.md §6)
-- Date: 2026-09-14

BEGIN;

CREATE TEMPORARY TABLE IF NOT EXISTS test_results (
  test_id     TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  passed      BOOLEAN NOT NULL,
  details     TEXT
);

GRANT ALL ON TABLE test_results TO authenticated;

DO $$
DECLARE
  v_admin_active_id   UUID := gen_random_uuid();
  v_admin_readonly_id UUID := gen_random_uuid();
  v_tenant_active_id  UUID;
  v_tenant_ro_id      UUID;
  v_unit_id           BIGINT;
  v_rows_updated      INTEGER;
BEGIN
  -- 0. Insert mock auth users
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_active_id, 'admin_active@test.invalid'),
    (v_admin_readonly_id, 'admin_ro@test.invalid');

  -- 1. Setup Tenant Active (auto-provisioned oleh trigger handle_new_tenant)
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Test Tenant Active', 'rt_rw', v_admin_active_id)
  RETURNING id INTO v_tenant_active_id;

  UPDATE public.tenant_subscriptions
  SET status = 'active'
  WHERE tenant_id = v_tenant_active_id;

  -- 2. Setup Tenant Read-Only
  INSERT INTO public.tenants (name, type, owner_id)
  VALUES ('Test Tenant Read-Only', 'rt_rw', v_admin_readonly_id)
  RETURNING id INTO v_tenant_ro_id;

  UPDATE public.tenant_subscriptions
  SET status = 'read_only'
  WHERE tenant_id = v_tenant_ro_id;

  -- Masukkan 1 unit awal di tenant read-only (dengan bypass superuser sebelum set claim)
  INSERT INTO public.tenant_units (tenant_id, label, metadata)
  VALUES (v_tenant_ro_id, 'Unit RO A-01', '{}'::jsonb)
  RETURNING id INTO v_unit_id;

  -- 3. TEST 1: Tenant Active -> INSERT diperbolehkan
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_admin_active_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    INSERT INTO public.tenant_units (tenant_id, label, metadata)
    VALUES (v_tenant_active_id, 'Unit Active A-01', '{}'::jsonb);

    INSERT INTO test_results VALUES (
      'T5.3-01',
      'Tenant Active: Admin BISA insert ke tenant_units',
      true,
      'Insert berhasil pada tenant berstatus active'
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results VALUES (
      'T5.3-01',
      'Tenant Active: Admin BISA insert ke tenant_units',
      false,
      'Gagal insert: ' || SQLERRM
    );
  END;

  -- 4. TEST 2: Tenant Read-Only -> SELECT tetap diperbolehkan
  PERFORM set_config('request.jwt.claim.sub', v_admin_readonly_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    PERFORM 1 FROM public.tenant_units WHERE tenant_id = v_tenant_ro_id;

    INSERT INTO test_results VALUES (
      'T5.3-02',
      'Tenant Read-Only: Admin TETAP BISA SELECT data unit (FR-15)',
      true,
      'SELECT berhasil untuk pembacaan data'
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results VALUES (
      'T5.3-02',
      'Tenant Read-Only: Admin TETAP BISA SELECT data unit (FR-15)',
      false,
      'SELECT ditolak: ' || SQLERRM
    );
  END;

  -- 5. TEST 3: Tenant Read-Only -> INSERT DITOLAK OLEH RLS
  BEGIN
    INSERT INTO public.tenant_units (tenant_id, label, metadata)
    VALUES (v_tenant_ro_id, 'Unit RO A-02', '{}'::jsonb);

    INSERT INTO test_results VALUES (
      'T5.3-03',
      'Tenant Read-Only: Admin DITOLAK saat INSERT ke tenant_units',
      false,
      'Error: Insert berhasil seharusnya ditolak oleh RLS!'
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results VALUES (
      'T5.3-03',
      'Tenant Read-Only: Admin DITOLAK saat INSERT ke tenant_units',
      true,
      'RLS berhasil memblokir INSERT saat status read_only (' || SQLERRM || ')'
    );
  END;

  -- 6. TEST 4: Tenant Read-Only -> UPDATE DITOLAK OLEH RLS
  BEGIN
    UPDATE public.tenant_units
    SET label = 'Unit RO Modified'
    WHERE id = v_unit_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated = 0 THEN
      INSERT INTO test_results VALUES (
        'T5.3-04',
        'Tenant Read-Only: Admin DITOLAK saat UPDATE ke tenant_units',
        true,
        'RLS berhasil memblokir UPDATE (0 baris terupdate)'
      );
    ELSE
      INSERT INTO test_results VALUES (
        'T5.3-04',
        'Tenant Read-Only: Admin DITOLAK saat UPDATE ke tenant_units',
        false,
        'Error: Update berhasil sebanyak ' || v_rows_updated || ' baris, seharusnya 0!'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO test_results VALUES (
      'T5.3-04',
      'Tenant Read-Only: Admin DITOLAK saat UPDATE ke tenant_units',
      true,
      'RLS berhasil menolak UPDATE dengan error: ' || SQLERRM
    );
  END;

END $$;

SELECT test_id, description, passed, details FROM test_results ORDER BY test_id;

ROLLBACK;
