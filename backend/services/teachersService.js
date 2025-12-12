import { supabase } from '../config/supabase.js';

export async function listTeachers() {
  const { data, error } = await supabase.from('teachers').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function getTeacherById(id) {
  const { data, error } = await supabase.from('teachers').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
