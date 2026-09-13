-- Migration: Create subscription and billing tables
-- Task: T1.2 (Ref: requirement.md FR-7 s/d FR-14, specification.md §2)
-- Date: 2026-09-13

BEGIN;

-- 1. Enum subscription_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'read_only');
  END IF;
END $$;

-- 2. Tabel block_pricing (Harga per tipe tenant & kapasitas blok)
CREATE TABLE IF NOT EXISTS public.block_pricing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_type       public.tenant_type NOT NULL,
  block_size        INTEGER NOT NULL CHECK (block_size IN (5, 10)),
  price_per_block   NUMERIC(12,2) NOT NULL CHECK (price_per_block >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_block_pricing_type_size UNIQUE (tenant_type, block_size)
);

-- 3. Tabel subscription_periods (Opsi durasi langganan: 3, 6, 12 bulan)
CREATE TABLE IF NOT EXISTS public.subscription_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duration_months   INTEGER NOT NULL CHECK (duration_months IN (3, 6, 12)),
  discount_percent  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_subscription_periods_duration UNIQUE (duration_months)
);

-- 4. Tabel tenant_subscriptions (Mesin pelacak siklus hidup langganan)
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status                public.subscription_status NOT NULL DEFAULT 'trial',
  period_id             UUID REFERENCES public.subscription_periods(id) ON DELETE SET NULL,
  next_period_id        UUID REFERENCES public.subscription_periods(id) ON DELETE SET NULL,
  trial_started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at         TIMESTAMPTZ NOT NULL,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_subscriptions_tenant UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON public.tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON public.tenant_subscriptions(status);

-- 5. Tabel tenant_subscription_blocks (Rincian kombinasi blok yang dibeli)
CREATE TABLE IF NOT EXISTS public.tenant_subscription_blocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
  block_size        INTEGER NOT NULL CHECK (block_size IN (5, 10)),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  price_snapshot    NUMERIC(12,2) NOT NULL CHECK (price_snapshot >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_blocks_subscription_id ON public.tenant_subscription_blocks(subscription_id);

-- 6. Tabel subscription_payments (Transaksi pembayaran subscription via Mayar QRIS)
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  qris_ref          TEXT,
  payment_url       TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  paid_at           TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_subscription_id ON public.subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON public.subscription_payments(status);

-- 7. RLS Enforcements
ALTER TABLE public.block_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscription_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Pricing & Periods dapat dibaca oleh seluruh user terautentikasi (untuk kalkulator harga)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'block_pricing' AND policyname = 'block_pricing_select_all'
  ) THEN
    CREATE POLICY "block_pricing_select_all" ON public.block_pricing
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_periods' AND policyname = 'subscription_periods_select_all'
  ) THEN
    CREATE POLICY "subscription_periods_select_all" ON public.subscription_periods
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscriptions' AND policyname = 'tenant_subscriptions_select_owner'
  ) THEN
    CREATE POLICY "tenant_subscriptions_select_owner" ON public.tenant_subscriptions
      FOR SELECT USING (
        tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscriptions' AND policyname = 'tenant_subscriptions_update_owner'
  ) THEN
    CREATE POLICY "tenant_subscriptions_update_owner" ON public.tenant_subscriptions
      FOR UPDATE USING (
        tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tenant_subscription_blocks' AND policyname = 'subscription_blocks_select_owner'
  ) THEN
    CREATE POLICY "subscription_blocks_select_owner" ON public.tenant_subscription_blocks
      FOR SELECT USING (
        subscription_id IN (
          SELECT s.id FROM public.tenant_subscriptions s
          JOIN public.tenants t ON t.id = s.tenant_id
          WHERE t.owner_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscription_payments' AND policyname = 'subscription_payments_select_owner'
  ) THEN
    CREATE POLICY "subscription_payments_select_owner" ON public.subscription_payments
      FOR SELECT USING (
        subscription_id IN (
          SELECT s.id FROM public.tenant_subscriptions s
          JOIN public.tenants t ON t.id = s.tenant_id
          WHERE t.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.subscription_payments;
-- DROP TABLE IF EXISTS public.tenant_subscription_blocks;
-- DROP TABLE IF EXISTS public.tenant_subscriptions;
-- DROP TABLE IF EXISTS public.subscription_periods;
-- DROP TABLE IF EXISTS public.block_pricing;
-- DROP TYPE IF EXISTS public.subscription_status;
