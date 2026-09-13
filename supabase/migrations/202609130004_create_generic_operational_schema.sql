-- Migration: Create tenant_units and tenant_members tables
-- Task: T1.4 (Ref: requirement.md FR-2, FR-5, specification.md §3, §4)
-- Date: 2026-09-13

BEGIN;

-- 1. Tabel tenant_units (Unit generik: rumah / kamar kos / slot peserta)
CREATE TABLE IF NOT EXISTS public.tenant_units (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_units_tenant_id ON public.tenant_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_units_status ON public.tenant_units(status);

-- 2. Tabel tenant_members (Keanggotaan pengguna di dalam tenant)
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id           BIGINT REFERENCES public.tenant_units(id) ON DELETE SET NULL,
  full_name         TEXT NOT NULL,
  phone             TEXT,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'bendahara', 'pengurus', 'anggota')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  occupancy_status  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_members_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_unit_id ON public.tenant_members(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_role ON public.tenant_members(role);
CREATE INDEX IF NOT EXISTS idx_tenant_members_status ON public.tenant_members(status);

-- 3. RLS Enforcements
ALTER TABLE public.tenant_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Anggota tenant dapat melihat unit dalam tenant mereka
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_units' AND policyname = 'tenant_units_select_member'
  ) THEN
    CREATE POLICY "tenant_units_select_member" ON public.tenant_units
      FOR SELECT USING (
        tenant_id IN (
          SELECT tm.tenant_id FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid() AND tm.status = 'approved'
        )
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      );
  END IF;

  -- Admin tenant & Platform Admin dapat mengelola unit
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_units' AND policyname = 'tenant_units_manage_admin'
  ) THEN
    CREATE POLICY "tenant_units_manage_admin" ON public.tenant_units
      FOR ALL USING (
        tenant_id IN (
          SELECT tm.tenant_id FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'approved'
        )
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      ) WITH CHECK (
        tenant_id IN (
          SELECT tm.tenant_id FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'approved'
        )
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      );
  END IF;

  -- Anggota dapat melihat profil sesama anggota dalam tenant yang sama
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_members' AND policyname = 'tenant_members_select_tenant'
  ) THEN
    CREATE POLICY "tenant_members_select_tenant" ON public.tenant_members
      FOR SELECT USING (
        tenant_id IN (
          SELECT tm.tenant_id FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid() AND tm.status = 'approved'
        )
        OR
        user_id = auth.uid()
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      );
  END IF;

  -- Pendaftaran mandiri anggota ke tenant (atau dibuat oleh admin / platform owner)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_members' AND policyname = 'tenant_members_insert_self'
  ) THEN
    CREATE POLICY "tenant_members_insert_self" ON public.tenant_members
      FOR INSERT WITH CHECK (
        user_id = auth.uid()
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      );
  END IF;

  -- Update profil anggota
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_members' AND policyname = 'tenant_members_update'
  ) THEN
    CREATE POLICY "tenant_members_update" ON public.tenant_members
      FOR UPDATE USING (
        user_id = auth.uid()
        OR
        tenant_id IN (
          SELECT tm.tenant_id FROM public.tenant_members tm
          WHERE tm.user_id = auth.uid() AND tm.role = 'admin' AND tm.status = 'approved'
        )
        OR
        tenant_id IN (
          SELECT t.id FROM public.tenants t
          WHERE t.owner_id = auth.uid()
        )
        OR
        public.is_platform_admin()
      );
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.tenant_members;
-- DROP TABLE IF EXISTS public.tenant_units;
