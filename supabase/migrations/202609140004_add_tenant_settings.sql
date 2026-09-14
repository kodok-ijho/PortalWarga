-- Migration: Add settings JSONB column to tenants table
-- Task: T6.2 (Ref: requirement.md FR-16, specification.md §2, §3)
-- Date: 2026-09-14

BEGIN;

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_tenants_settings ON public.tenants USING gin (settings);

COMMIT;
