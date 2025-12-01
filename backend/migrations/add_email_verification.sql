-- Migration: Add email verification fields and confirmation tracking to slots

ALTER TABLE slots 
ADD COLUMN IF NOT EXISTS verification_token TEXT,
ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_slots_verification_token ON slots(verification_token);
