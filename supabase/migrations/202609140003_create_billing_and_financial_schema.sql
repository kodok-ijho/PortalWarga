-- Migration: Create generic billing_items, payments, and expenses tables with RLS
-- Task: T6.1 (Ref: requirement.md FR-3, FR-4, FR-15, FR-16; specification.md §3, §6)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- 1. TABEL billing_items (Tagihan Generik: IPL, Sewa, Arisan, SPP)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_id           BIGINT REFERENCES public.tenant_units(id) ON DELETE SET NULL,
  member_id         UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  period            TEXT NOT NULL, -- Format 'YYYY-MM'
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  late_fee          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_fee >= 0),
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'pending_verification', 'paid', 'cancelled')),
  qris_ref          TEXT,
  contract_start    DATE, -- Khusus vertikal kos
  contract_end      DATE, -- Khusus vertikal kos
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_items_tenant_id ON public.billing_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_items_unit_id ON public.billing_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_billing_items_member_id ON public.billing_items(member_id);
CREATE INDEX IF NOT EXISTS idx_billing_items_period ON public.billing_items(period);
CREATE INDEX IF NOT EXISTS idx_billing_items_status ON public.billing_items(status);

-- ============================================================
-- 2. TABEL payments (Pencatatan Pembayaran & Verifikasi Transfer)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  billing_item_id   UUID REFERENCES public.billing_items(id) ON DELETE SET NULL,
  member_id         UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  method            TEXT NOT NULL CHECK (method IN ('qris', 'bank_transfer', 'cash')),
  transaction_id    TEXT,
  status            TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending', 'pending_verification', 'completed', 'rejected')),
  proof_url         TEXT,
  verified_by       UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_billing_item_id ON public.payments(billing_item_id);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON public.payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- ============================================================
-- 3. TABEL expenses (Pengeluaran Kas Komunitas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category          TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description       TEXT,
  receipt_url       TEXT,
  recorded_by       UUID REFERENCES public.tenant_members(id) ON DELETE SET NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON public.expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at);

-- ============================================================
-- 4. TRIGGERS touch_updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_billing_items_updated ON public.billing_items;
CREATE TRIGGER trg_billing_items_updated BEFORE UPDATE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated ON public.payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- --- billing_items RLS ---
DROP POLICY IF EXISTS "billing_items_select_member" ON public.billing_items;
CREATE POLICY "billing_items_select_member" ON public.billing_items
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "billing_items_manage_admin" ON public.billing_items;
CREATE POLICY "billing_items_manage_admin" ON public.billing_items
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

-- --- payments RLS ---
DROP POLICY IF EXISTS "payments_select_member" ON public.payments;
CREATE POLICY "payments_select_member" ON public.payments
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "payments_insert_member" ON public.payments;
CREATE POLICY "payments_insert_member" ON public.payments
  FOR INSERT WITH CHECK (
    public.is_platform_admin()
    OR (
      tenant_id IN (SELECT public.current_tenant_ids())
      AND public.tenant_subscription_status(tenant_id) != 'read_only'
    )
  );

DROP POLICY IF EXISTS "payments_update_admin" ON public.payments;
CREATE POLICY "payments_update_admin" ON public.payments
  FOR UPDATE USING (
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

-- --- expenses RLS ---
DROP POLICY IF EXISTS "expenses_select_member" ON public.expenses;
CREATE POLICY "expenses_select_member" ON public.expenses
  FOR SELECT USING (
    tenant_id IN (SELECT public.current_tenant_ids())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "expenses_manage_admin" ON public.expenses;
CREATE POLICY "expenses_manage_admin" ON public.expenses
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
-- DROP TABLE IF EXISTS public.expenses;
-- DROP TABLE IF EXISTS public.payments;
-- DROP TABLE IF EXISTS public.billing_items;
