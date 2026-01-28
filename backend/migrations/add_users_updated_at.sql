-- Migration: Ensure users.updated_at exists and is maintained automatically
-- This fixes environments where users table was created without updated_at.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill is effectively handled by DEFAULT for existing rows in many setups,
-- but keep it explicit if column existed and was nullable earlier.
UPDATE public.users
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- Create a reusable trigger function for updated_at (idempotent).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists for users table.
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON public.users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
