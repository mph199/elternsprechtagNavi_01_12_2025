-- Migration: Add settings table for event configuration

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  event_name VARCHAR(255) NOT NULL DEFAULT 'Elternsprechtag',
  event_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (event_name, event_date) 
VALUES ('BKSB Elternsprechtag', '2025-11-24')
ON CONFLICT DO NOTHING;

-- RLS Policies
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are viewable by everyone" 
  ON settings FOR SELECT 
  USING (true);

CREATE POLICY "Anyone can update settings" 
  ON settings FOR UPDATE 
  USING (true);

CREATE POLICY "Anyone can insert settings" 
  ON settings FOR INSERT 
  WITH CHECK (true);

COMMENT ON TABLE settings IS 'Global settings for the event system';
COMMENT ON COLUMN settings.event_date IS 'Date of the parent-teacher conference';
