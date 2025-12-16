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
        email: data.email,
        salutation: data.salutation,
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
 * PUT /api/teacher/room
 * Body: { room?: string | null }
 * Allows logged-in teacher to update their own room.
 */
router.put('/room', requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const rawRoom = req.body?.room;
    const nextRoom = typeof rawRoom === 'string'
      ? rawRoom.trim()
      : rawRoom == null
        ? null
        : String(rawRoom).trim();

    if (typeof nextRoom === 'string' && nextRoom.length > 60) {
      return res.status(400).json({ error: 'Raum darf maximal 60 Zeichen lang sein' });
    }

    const roomValue = nextRoom && nextRoom.length ? nextRoom : null;

    const { data, error } = await supabase
      .from('teachers')
      .update({ room: roomValue })
      .eq('id', teacherId)
      .select('id, name, subject, system, room')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      teacher: {
        id: data.id,
        name: data.name,
        subject: data.subject,
        system: data.system,
        room: data.room,
      },
    });
  } catch (error) {
    console.error('Error updating teacher room:', error);
    return res.status(500).json({ error: 'Failed to update teacher room' });
  }
});

/**
 * POST /api/teacher/feedback
 * Body: { message: string }
 * Stores anonymous feedback (no teacher reference) for admin review.
 */
router.post('/feedback', requireAuth, requireTeacher, async (req, res) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'Bitte eine Nachricht eingeben.' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Nachricht darf maximal 2000 Zeichen lang sein.' });
    }

    const { data, error } = await supabase
      .from('feedback')
      .insert({ message })
      .select('id, message, created_at')
      .single();

    if (error) throw error;

    return res.json({ success: true, feedback: data });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return res.status(500).json({ error: 'Feedback konnte nicht gespeichert werden.' });
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

    // Load current booking data first (needed for cancellation email)
    const { data: current, error: curErr } = await supabase
      .from('slots')
      .select('*')
      .eq('id', slotId)
      .eq('teacher_id', teacherId)
      .eq('booked', true)
      .single();

    if (curErr) {
      if (curErr.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found, not booked, or not yours' });
      }
      throw curErr;
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
        verification_token_hash: null,
        verification_sent_at: null,
        verified_at: null,
        confirmation_sent_at: null,
        // cancellation_sent_at is written after mail send (best-effort)
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

    // Best-effort cancellation email (only if the booking email was verified)
    if (current && current.email && current.verified_at && isEmailConfigured()) {
      try {
        const teacherRes = await supabase.from('teachers').select('*').eq('id', teacherId).single();
        const teacher = teacherRes.data || {};
        const subject = `BKSB Elternsprechtag – Termin storniert am ${current.date} (${current.time})`;
        const plain = `Guten Tag,

      wir bestätigen Ihnen die Stornierung Ihres Termins.

      Termin: ${current.date} ${current.time}
      Lehrkraft: ${teacher.name || '—'}
      Raum: ${teacher.room || '—'}

      Wenn Sie einen neuen Termin vereinbaren möchten, können Sie dies jederzeit über das Buchungssystem tun.

      Mit freundlichen Grüßen

      Ihr BKSB-Team`;
        const html = `<p>Guten Tag,</p>
      <p>wir bestätigen Ihnen die Stornierung Ihres Termins.</p>
      <p><strong>Termin:</strong> ${current.date} ${current.time}<br/>
      <strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
      <strong>Raum:</strong> ${teacher.room || '—'}</p>
      <p>Wenn Sie einen neuen Termin vereinbaren möchten, können Sie dies jederzeit über das Buchungssystem tun.</p>
      <p>Mit freundlichen Grüßen</p>
      <p>Ihr BKSB-Team</p>`;
        await sendMail({ to: current.email, subject, text: plain, html });
        await supabase.from('slots').update({ cancellation_sent_at: new Date().toISOString() }).eq('id', slotId);
      } catch (e) {
        console.warn('Sending cancellation email (teacher) failed:', e?.message || e);
      }
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

    // Load current state first (needed to enforce email verification before confirmation)
    const { data: current, error: curErr } = await supabase
      .from('slots')
      .select('*')
      .eq('id', slotId)
      .eq('teacher_id', teacherId)
      .eq('booked', true)
      .single();

    if (curErr) {
      if (curErr.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found or not booked' });
      }
      throw curErr;
    }

    if (current?.status === 'confirmed') {
      return res.json({ success: true, slot: current });
    }

    if (!current?.verified_at) {
      return res.status(409).json({
        error: 'Buchung kann erst bestätigt werden, nachdem die E-Mail-Adresse verifiziert wurde',
      });
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
        const subject = `BKSB Elternsprechtag – Termin bestätigt am ${data.date} (${data.time})`;
        const plain = `Guten Tag,

      Ihre Terminbuchung wurde durch die Lehrkraft bestätigt.

      Termin: ${data.date} ${data.time}
      Lehrkraft: ${teacher.name || '—'}
      Raum: ${teacher.room || '—'}

      Mit freundlichen Grüßen

      Ihr BKSB-Team`;
        const html = `<p>Guten Tag,</p>
      <p>Ihre Terminbuchung wurde durch die Lehrkraft bestätigt.</p>
      <p><strong>Termin:</strong> ${data.date} ${data.time}<br/>
      <strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
      <strong>Raum:</strong> ${teacher.room || '—'}</p>
      <p>Mit freundlichen Grüßen</p>
      <p>Ihr BKSB-Team</p>`;
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
