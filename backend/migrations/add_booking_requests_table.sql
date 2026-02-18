-- Migration: Add booking_requests table for privacy-friendly slot requests

CREATE TABLE IF NOT EXISTS booking_requests (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  requested_time VARCHAR(50) NOT NULL,
  date VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'requested',

  visitor_type VARCHAR(20) NOT NULL,
  parent_name VARCHAR(255),
  company_name VARCHAR(255),
  student_name VARCHAR(255),
  trainee_name VARCHAR(255),
  representative_name VARCHAR(255),
  class_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message TEXT,

  verification_token_hash VARCHAR(128),
  verification_sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  confirmation_sent_at TIMESTAMPTZ,

  assigned_slot_id INTEGER REFERENCES slots(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT booking_requests_status_check CHECK (status IN ('requested','accepted','declined')),
  CONSTRAINT booking_requests_visitor_type_check CHECK (visitor_type IN ('parent','company'))
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_teacher_id ON booking_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_event_id ON booking_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests(status);

-- Keep table inaccessible from anon/auth by default; backend uses service role.
ALTER TABLE IF EXISTS public.booking_requests ENABLE ROW LEVEL SECURITY;
