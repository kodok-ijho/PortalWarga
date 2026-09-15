-- Migration: Add RPC get_invite_details and enforce subscription status on tenant_members
-- Task: T6.3 (Ref: requirement.md FR-16, specification.md §3, §4, §6)
-- Date: 2026-09-14

BEGIN;

-- 1. RPC publik untuk lookup informasi tenant & daftar unit via kode undangan
CREATE OR REPLACE FUNCTION public.get_invite_details(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_units JSONB;
BEGIN
  -- Cari tenant berdasarkan invite_code di settings
  SELECT id, name, type, address, contact_phone
  INTO v_tenant
  FROM public.tenants
  WHERE upper(settings->>'invite_code') = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'message', 'Kode undangan tidak valid atau tidak ditemukan.');
  END IF;

  -- Ambil daftar unit aktif milik tenant
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'label', label,
      'status', status
    ) ORDER BY id ASC
  )
  INTO v_units
  FROM public.tenant_units
  WHERE tenant_id = v_tenant.id;

  RETURN jsonb_build_object(
    'found', true,
    'tenant_id', v_tenant.id,
    'tenant_name', v_tenant.name,
    'tenant_type', v_tenant.type,
    'address', v_tenant.address,
    'contact_phone', v_tenant.contact_phone,
    'units', coalesce(v_units, '[]'::jsonb)
  );
END;
$$;

-- Berikan izin eksekusi ke anon & authenticated
GRANT EXECUTE ON FUNCTION public.get_invite_details(TEXT) TO anon, authenticated;

-- 2. Update RLS policies tenant_members agar sinkron dengan status subscription
DROP POLICY IF EXISTS "tenant_members_update" ON public.tenant_members;
CREATE POLICY "tenant_members_update" ON public.tenant_members
  FOR UPDATE USING (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
    OR (
      user_id = auth.uid()
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  ) WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
    OR (
      user_id = auth.uid()
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  );

COMMIT;
