import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { isEmailConfigured, sendMail } from '../config/email.js';
import bcrypt from 'bcryptjs';
import { mapSlotRow, mapBookingRowWithTeacher } from '../utils/mappers.js';

const router = express.Router();

/**
 * Middleware: Require teacher role
 */
function requireTeacher(req, res, next) {
  if (req.user && (req.user.role === 'teacher' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ 
    error: 'Forbidden', 
    message: 'Teacher access required' 
  });
}

/**
 * GET /api/teacher/bookings
 * Get all bookings for the logged-in teacher
 */
router.get('/bookings', requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const { data, error } = await supabase
      .from('slots')
      .select(`
        *,
        teacher:teachers(name, subject)
      `)
      .eq('teacher_id', teacherId)
      .eq('booked', true)
      .order('date')
      .order('time');
    
    if (error) throw error;
    
    const bookings = (data || []).map(mapBookingRowWithTeacher);
  
    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching teacher bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

/**
 * GET /api/teacher/slots
 * Get all slots for the logged-in teacher
 */
router.get('/slots', requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('date')
      .order('time');
    
    if (error) throw error;
    
    const slots = (data || []).map(mapSlotRow);
    
    res.json({ slots });
  } catch (error) {
    console.error('Error fetching teacher slots:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

/**
 * GET /api/teacher/info
 * Get info about the logged-in teacher
 */
router.get('/info', requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('id', teacherId)
      .single();
    
    if (error) throw error;
    
    res.json({ 
      teacher: {
        id: data.id,
        name: data.name,
        subject: data.subject,
        system: data.system,
        room: data.room
      }
    });
  } catch (error) {
    console.error('Error fetching teacher info:', error);
    res.status(500).json({ error: 'Failed to fetch teacher info' });
  }
});

/**
 * DELETE /api/teacher/bookings/:slotId
 * Cancel a booking (teacher can cancel their own bookings)
 */
router.delete('/bookings/:slotId', requireAuth, requireTeacher, async (req, res) => {
  const slotId = parseInt(req.params.slotId, 10);
  
  if (isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slotId' });
  }

  try {
    const teacherId = req.user.teacherId;
    
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    // Clear booking data, but only for own slots
    const { data, error } = await supabase
      .from('slots')
      .update({
        booked: false,
        status: null,
        visitor_type: null,
        parent_name: null,
        company_name: null,
        student_name: null,
        trainee_name: null,
        representative_name: null,
        class_name: null,
        email: null,
        message: null,
        verification_token: null,
        verification_sent_at: null,
        verified_at: null,
        confirmation_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', slotId)
      .eq('teacher_id', teacherId) // Only allow canceling own bookings
      .eq('booked', true)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found, not booked, or not yours' });
      }
      throw error;
    }

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

/**
 * PUT /api/teacher/bookings/:slotId/accept
 * Accept a reserved booking (set status to confirmed)
 */
router.put('/bookings/:slotId/accept', requireAuth, requireTeacher, async (req, res) => {
  const slotId = parseInt(req.params.slotId, 10);
  if (isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slotId' });
  }

  try {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    // Update status to confirmed
    const { data, error } = await supabase
      .from('slots')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', slotId)
      .eq('teacher_id', teacherId)
      .eq('booked', true)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found or not booked' });
      }
      throw error;
    }

    // If visitor already verified and we haven't sent confirmation, send now
    if (data && data.verified_at && !data.confirmation_sent_at && isEmailConfigured()) {
      try {
        const teacherRes = await supabase.from('teachers').select('*').eq('id', teacherId).single();
        const teacher = teacherRes.data || {};
        const subject = `Bestätigung: Termin am ${data.date} (${data.time})`;
        const plain = `Guten Tag,

Ihre Terminbuchung wurde bestätigt.

Termin: ${data.date} ${data.time}
Lehrkraft: ${teacher.name || '—'}
Raum: ${teacher.room || '—'}

Bis bald!`;
        const html = `<p>Guten Tag,</p>
<p>Ihre Terminbuchung wurde bestätigt.</p>
<p><strong>Termin:</strong> ${data.date} ${data.time}<br/>
<strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
<strong>Raum:</strong> ${teacher.room || '—'}</p>
<p>Bis bald!</p>`;
        await sendMail({ to: data.email, subject, text: plain, html });
        await supabase.from('slots').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', data.id);
      } catch (e) {
        console.warn('Sending confirmation email failed:', e?.message || e);
      }
    }

    res.json({ success: true, slot: data });
  } catch (error) {
    console.error('Error accepting booking:', error);
    res.status(500).json({ error: 'Failed to accept booking' });
  }
});

/**
 * PUT /api/teacher/password
 * Body: { currentPassword, newPassword }
 * Allows logged-in teacher to change their own password
 */
router.put('/password', requireAuth, requireTeacher, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen haben' });
  }
  try {
    // Find user by username from token
    const username = req.user.username;
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .limit(1);
    if (userErr) throw userErr;
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    const user = users[0];

    // Verify current password if provided; require for safety
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash || ''))) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    const { error: upErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);
    if (upErr) throw upErr;

    res.json({ success: true, message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Fehler beim Ändern des Passworts' });
  }
});

export default router;
