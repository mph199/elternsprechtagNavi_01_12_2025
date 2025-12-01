import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1) Load from current working directory (works for `npm run dev` in backend)
dotenv.config();

// 2) Fallback: load backend/.env relative to this file (works when running scripts from repo root)
if (!process.env.SUPABASE_KEY || !process.env.SUPABASE_URL) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const supabaseUrl = process.env.SUPABASE_URL || 'https://hkavljocvckejejcwatw.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseKey) {
  throw new Error('SUPABASE_KEY environment variable is required');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
