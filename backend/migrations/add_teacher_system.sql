-- Migration: Add system column to teachers table
-- Adds system type (dual or allgemeinbildend) for time slot assignment

-- Add system column with default value
ALTER TABLE teachers 
ADD COLUMN system VARCHAR(20) NOT NULL DEFAULT 'dual';

-- Add constraint to validate system values
ALTER TABLE teachers 
ADD CONSTRAINT teachers_system_check 
CHECK (system IN ('dual', 'vollzeit'));

-- Update existing teachers to dual system (default)
-- If you want to set specific teachers to vollzeit, run UPDATE statements here:
-- UPDATE teachers SET system = 'vollzeit' WHERE id IN (1, 2, 3);

COMMENT ON COLUMN teachers.system IS 'dual = 16:00-18:00 Uhr, vollzeit = 17:00-19:00 Uhr';
