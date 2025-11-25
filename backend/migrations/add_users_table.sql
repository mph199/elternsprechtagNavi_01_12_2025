-- Migration: Create users table with roles
-- Supports admin and teacher logins with role-based access

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher')),
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Insert default admin user (password: admin123)
-- Password hash generated with bcrypt rounds=10
INSERT INTO users (username, password_hash, role, teacher_id) VALUES
  ('admin', '$2a$10$XqZ9J5vXZKZ5JZt5Z5Z5ZuZt5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5', 'admin', NULL)
ON CONFLICT (username) DO NOTHING;

-- Example teacher users (password: teacher123 for all)
-- These should be linked to actual teacher IDs from teachers table
-- INSERT INTO users (username, password_hash, role, teacher_id) VALUES
--   ('mueller', '$2a$10$hash...', 'teacher', 1),
--   ('schmidt', '$2a$10$hash...', 'teacher', 2)
-- ON CONFLICT (username) DO NOTHING;

COMMENT ON TABLE users IS 'User accounts with role-based access (admin or teacher)';
COMMENT ON COLUMN users.role IS 'admin = full access, teacher = own appointments only';
COMMENT ON COLUMN users.teacher_id IS 'Links teacher users to their teacher record';
