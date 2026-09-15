-- Migration: Create public_listings, listing_pricing, and listing_payments tables
-- Task: T10.1 (Ref: requirement.md FR-22, FR-25, FR-27, specification.md §5.1)
-- Date: 2026-09-14

BEGIN;

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.listing_type AS ENUM ('room_vacancy', 'umkm');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.listing_status AS ENUM ('active', 'rented_or_sold', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. PUBLIC LISTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.public_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_id         BIGINT REFERENCES public.tenant_units(id) ON DELETE SET NULL,
  posted_by       UUID NOT NULL REFERENCES public.tenant_members(id) ON DELETE CASCADE,
  type            public.listing_type NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  price           NUMERIC(12,2),
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_phone   TEXT NOT NULL,
  location_hint   TEXT,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  featured_until  TIMESTAMPTZ,
  status          public.listing_status NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_listings_tenant_id ON public.public_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_public_listings_unit_id ON public.public_listings(unit_id);
CREATE INDEX IF NOT EXISTS idx_public_listings_posted_by ON public.public_listings(posted_by);
CREATE INDEX IF NOT EXISTS idx_public_listings_type_status ON public.public_listings(type, status);
CREATE INDEX IF NOT EXISTS idx_public_listings_is_featured ON public.public_listings(is_featured);
CREATE INDEX IF NOT EXISTS idx_public_listings_expires_at ON public.public_listings(expires_at);

-- ============================================================
-- 3. LISTING PRICING TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_pricing (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_type    public.listing_type NOT NULL,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  duration_days   INTEGER NOT NULL DEFAULT 30,
  price           NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_listing_pricing UNIQUE (listing_type, is_featured, duration_days)
);

CREATE INDEX IF NOT EXISTS idx_listing_pricing_lookup ON public.listing_pricing(listing_type, is_featured, duration_days);

-- ============================================================
-- 4. LISTING PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES public.public_listings(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  qris_ref        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listing_payments_listing_id ON public.listing_payments(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_payments_status ON public.listing_payments(status);

-- ============================================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================================

DROP TRIGGER IF EXISTS trg_public_listings_updated_at ON public.public_listings;
CREATE TRIGGER trg_public_listings_updated_at
  BEFORE UPDATE ON public.public_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_listing_pricing_updated_at ON public.listing_pricing;
CREATE TRIGGER trg_listing_pricing_updated_at
  BEFORE UPDATE ON public.listing_pricing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_listing_payments_updated_at ON public.listing_payments;
CREATE TRIGGER trg_listing_payments_updated_at
  BEFORE UPDATE ON public.listing_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.public_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_payments ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.listing_payments CASCADE;
-- DROP TABLE IF EXISTS public.listing_pricing CASCADE;
-- DROP TABLE IF EXISTS public.public_listings CASCADE;
-- DROP TYPE IF EXISTS public.listing_status;
-- DROP TYPE IF EXISTS public.listing_type;
