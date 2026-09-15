-- Migration: Register dyudhiantoro@gmail.com as superadmin and set auto-promotion trigger
-- Date: 2026-09-15

BEGIN;

-- 1. Table to store platform superadmin emails whitelist
CREATE TABLE IF NOT EXISTS public.platform_superadmin_emails (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on platform_superadmin_emails
ALTER TABLE public.platform_superadmin_emails ENABLE ROW LEVEL SECURITY;

-- 2. Insert dyudhiantoro@gmail.com to whitelist
INSERT INTO public.platform_superadmin_emails (email)
VALUES ('dyudhiantoro@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 3. If dyudhiantoro@gmail.com already exists in auth.users, promote immediately
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users
WHERE lower(email) = 'dyudhiantoro@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- 4. Trigger on auth.users: automatically assign to platform_admins when dyudhiantoro@gmail.com registers or logs in
CREATE OR REPLACE FUNCTION public.handle_superadmin_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.platform_superadmin_emails
    WHERE lower(email) = lower(NEW.email)
  ) THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_superadmin ON auth.users;
CREATE TRIGGER on_auth_user_created_superadmin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_superadmin_user_created();

-- 5. Update is_platform_admin() function to check platform_admins, platform_superadmin_emails, and auth.jwt()
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_superadmin_emails
      WHERE lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
    OR EXISTS (
      SELECT 1 FROM auth.users u
      JOIN public.platform_superadmin_emails pse ON lower(u.email) = lower(pse.email)
      WHERE u.id = auth.uid()
    )
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_superadmin_emails' AND policyname = 'superadmin_emails_select_admin'
  ) THEN
    CREATE POLICY "superadmin_emails_select_admin" ON public.platform_superadmin_emails
      FOR SELECT USING (
        public.is_platform_admin()
      );
  END IF;
END $$;

COMMIT;
