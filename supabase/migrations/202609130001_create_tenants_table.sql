-- Migration: Create tenant_type enum and tenants table
-- Task: T1.1 (Ref: requirement.md FR-1, specification.md §2)
-- Date: 2026-09-13

BEGIN;

-- 1. Enum tenant_type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_type') THEN
    CREATE TYPE public.tenant_type AS ENUM ('rt_rw', 'kos', 'arisan', 'kelas');
  END IF;
END $$;

-- 2. Tabel tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  type            public.tenant_type NOT NULL,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  address         TEXT,
  contact_phone   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pencarian
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id ON public.tenants(owner_id);
CREATE INDEX IF NOT EXISTS idx_tenants_type ON public.tenants(type);

-- 3. RLS Dasar
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Owner dapat melihat tenant miliknya
CREATE POLICY "tenants_select_owner" ON public.tenants
  FOR SELECT USING (
    owner_id = auth.uid()
  );

-- Authenticated user dapat membuat tenant baru (menjadi owner)
CREATE POLICY "tenants_insert_owner" ON public.tenants
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
  );

-- Owner dapat memperbarui info tenant miliknya
CREATE POLICY "tenants_update_owner" ON public.tenants
  FOR UPDATE USING (
    owner_id = auth.uid()
  ) WITH CHECK (
    owner_id = auth.uid()
  );

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS "tenants_update_owner" ON public.tenants;
-- DROP POLICY IF EXISTS "tenants_insert_owner" ON public.tenants;
-- DROP POLICY IF EXISTS "tenants_select_owner" ON public.tenants;
-- DROP TABLE IF EXISTS public.tenants;
-- DROP TYPE IF EXISTS public.tenant_type;
