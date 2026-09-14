-- Migration: Create arisan_rounds and arisan_participants tables with RLS
-- Task: T8.2 (Ref: requirement.md FR-18, specification.md §5 & §6)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- 1. TABEL: arisan_rounds (Putaran Arisan)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arisan_rounds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  round_number      integer NOT NULL DEFAULT 1,
  period            text NOT NULL,          -- 'YYYY-MM' atau nama putaran (e.g. 'Putaran #1')
  status            text NOT NULL DEFAULT 'collecting'
                    CHECK (status IN ('collecting', 'ready_to_draw', 'drawn', 'cancelled')),
  winner_member_id  uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  total_pool_amount numeric(14,2) NOT NULL DEFAULT 0,
  drawn_at          timestamptz,
  drawn_by          uuid REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Index performa query putaran arisan
CREATE INDEX IF NOT EXISTS idx_arisan_rounds_tenant_status 
  ON public.arisan_rounds(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_arisan_rounds_winner 
  ON public.arisan_rounds(winner_member_id);

-- Trigger auto-update updated_at
DROP TRIGGER IF EXISTS trg_arisan_rounds_updated ON public.arisan_rounds;
CREATE TRIGGER trg_arisan_rounds_updated BEFORE UPDATE ON public.arisan_rounds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 2. TABEL: arisan_participants (Peserta & Status Kemenangan)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.arisan_participants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id         uuid NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  unit_slot_id      bigint REFERENCES public.tenant_units(id) ON DELETE SET NULL,
  has_won           boolean NOT NULL DEFAULT false,
  won_at_round_id   uuid REFERENCES public.arisan_rounds(id) ON DELETE SET NULL,
  won_at            timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, member_id)
);

-- Index performa query peserta arisan
CREATE INDEX IF NOT EXISTS idx_arisan_participants_tenant_won 
  ON public.arisan_participants(tenant_id, has_won);
CREATE INDEX IF NOT EXISTS idx_arisan_participants_member 
  ON public.arisan_participants(member_id);

-- Trigger auto-update updated_at
DROP TRIGGER IF EXISTS trg_arisan_participants_updated ON public.arisan_participants;
CREATE TRIGGER trg_arisan_participants_updated BEFORE UPDATE ON public.arisan_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.arisan_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arisan_participants ENABLE ROW LEVEL SECURITY;

-- 3.1 Policy arisan_rounds: SELECT (anggota tenant atau admin platform)
DROP POLICY IF EXISTS "arisan_rounds_select_member" ON public.arisan_rounds;
CREATE POLICY "arisan_rounds_select_member" ON public.arisan_rounds
  FOR SELECT USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

-- 3.2 Policy arisan_rounds: ALL (manage hanya admin tenant & subscription bukan read_only)
DROP POLICY IF EXISTS "arisan_rounds_manage_admin" ON public.arisan_rounds;
CREATE POLICY "arisan_rounds_manage_admin" ON public.arisan_rounds
  FOR ALL USING (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  ) WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  );

-- 3.3 Policy arisan_participants: SELECT (anggota tenant atau admin platform)
DROP POLICY IF EXISTS "arisan_participants_select_member" ON public.arisan_participants;
CREATE POLICY "arisan_participants_select_member" ON public.arisan_participants
  FOR SELECT USING (
    public.is_platform_admin()
    OR tenant_id IN (SELECT public.current_tenant_ids())
  );

-- 3.4 Policy arisan_participants: ALL (manage hanya admin tenant & subscription bukan read_only)
DROP POLICY IF EXISTS "arisan_participants_manage_admin" ON public.arisan_participants;
CREATE POLICY "arisan_participants_manage_admin" ON public.arisan_participants
  FOR ALL USING (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  ) WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_tenant_admin(tenant_id)
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  );

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.arisan_participants CASCADE;
-- DROP TABLE IF EXISTS public.arisan_rounds CASCADE;
