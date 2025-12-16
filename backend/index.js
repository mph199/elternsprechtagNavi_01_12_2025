import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import teacherRoutes from './routes/teacher.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { supabase } from './config/supabase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { isEmailConfigured, sendMail, getLastEmailDebugInfo } from './config/email.js';
import { listTeachers } from './services/teachersService.js';
import {
  listSlotsByTeacherId,
  reserveBooking,
  verifyBookingToken,
  listAdminBookings,
  cancelBookingAdmin,
} from './services/slotsService.js';
import { mapSlotRow } from './utils/mappers.js';

dotenv.config();

function normalizeAndValidateTeacherEmail(rawEmail) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const isValid = /^[a-z0-9._%+-]+@bksb\.nrw$/i.test(email);
  if (!email || !isValid) {
    return { ok: false, email: null };
  }
  return { ok: true, email };
}

function normalizeAndValidateTeacherSalutation(raw) {
  const salutation = typeof raw === 'string' ? raw.trim() : '';
  const allowed = new Set(['Herr', 'Frau', 'Divers']);
  if (!salutation || !allowed.has(salutation)) {
    return { ok: false, salutation: null };
  }
  return { ok: true, salutation };
}

// Express App
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  process.env.FRONTEND_URL // Vercel URL
].filter(Boolean);

// Flexible CORS: allow configured origins and safe hosted domains
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    try {
      const o = new URL(origin);
      const host = o.hostname;
      const isAllowedList = allowedOrigins.includes(origin);
      const isLocalhost = host === 'localhost' || host.startsWith('127.');
      const isVercel = host.endsWith('.vercel.app');
      const isRender = host.endsWith('.onrender.com');
      if (isAllowedList || isLocalhost || isVercel || isRender) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    } catch {
      return callback(new Error('Invalid origin'));
    }
  }
}));
app.use(express.json());

// Simple request logging (can be replaced by morgan later)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Auth Routes
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);

// Public Routes
// Dev helper: fetch last email preview URL (Ethereal)
app.get('/api/dev/email/last', (req, res) => {
  const transport = (process.env.MAIL_TRANSPORT || '').trim().toLowerCase();
  const allow = transport === 'ethereal' && process.env.NODE_ENV !== 'production';
  if (!allow) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({ email: getLastEmailDebugInfo() });
});

// GET /api/teachers
app.get('/api/teachers', async (_req, res) => {
  try {
    const teachers = await listTeachers();
    res.json({ teachers });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// GET /api/admin/feedback - List anonymous teacher feedback (admin only)
app.get('/api/admin/feedback', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('feedback')
      .select('id, message, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return res.json({ feedback: data || [] });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// GET /api/slots?teacherId=1
app.get('/api/slots', async (req, res) => {
  try {
    const { teacherId, eventId } = req.query;
    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId query param required' });
    }
    const teacherIdNum = parseInt(teacherId, 10);
    if (isNaN(teacherIdNum)) {
      return res.status(400).json({ error: 'teacherId must be a number' });
    }

    // Resolve event scope: explicit eventId OR active published event
    let resolvedEventId = null;
    if (eventId !== undefined) {
      const parsed = parseInt(String(eventId), 10);
      if (isNaN(parsed)) {
        return res.status(400).json({ error: 'eventId must be a number' });
      }
      resolvedEventId = parsed;
    } else {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('events')
        .select('id')
        .eq('status', 'published')
        .or(`booking_opens_at.is.null,booking_opens_at.lte.${now}`)
        .or(`booking_closes_at.is.null,booking_closes_at.gte.${now}`)
        .order('starts_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      resolvedEventId = data && data.length ? data[0].id : null;
    }

    const slots = await listSlotsByTeacherId(teacherIdNum);

    // Strict scoping: when an event is resolved (explicit or active), only return slots for that event.
    // This prevents legacy slots (event_id NULL) from showing up mixed with the active event.
    const scopedSlots = resolvedEventId
      ? slots.filter((s) => s.eventId === resolvedEventId)
      : slots;

    res.json({ slots: scopedSlots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// POST /api/bookings
// Body: { slotId, visitorType, parentName, companyName, studentName, traineeName, className, email, message }
app.post('/api/bookings', async (req, res) => {
  try {
    const payload = req.body || {};

    // Require active published event before accepting booking requests
    const nowIso = new Date().toISOString();
    const { data: activeEvents, error: activeErr } = await supabase
      .from('events')
      .select('id')
      .eq('status', 'published')
      .or(`booking_opens_at.is.null,booking_opens_at.lte.${nowIso}`)
      .or(`booking_closes_at.is.null,booking_closes_at.gte.${nowIso}`)
      .order('starts_at', { ascending: false })
      .limit(1);
    if (activeErr) throw activeErr;
    const activeEventId = activeEvents && activeEvents.length ? activeEvents[0].id : null;
    if (!activeEventId) {
      return res.status(409).json({ error: 'Buchungen sind aktuell nicht freigegeben' });
    }

    const { slotRow, verificationToken } = await reserveBooking(payload);

    // If the slot is linked to an event, enforce it matches active event
    if (slotRow?.event_id && slotRow.event_id !== activeEventId) {
      return res.status(409).json({ error: 'Dieser Termin gehört nicht zum aktuell freigegebenen Elternsprechtag' });
    }

    // Send verification email (best-effort)
    if (slotRow && isEmailConfigured()) {
      const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
      const verifyUrl = `${baseUrl}/verify?token=${verificationToken}`;
      const teacherRes = await supabase.from('teachers').select('*').eq('id', slotRow.teacher_id).single();
      const teacher = teacherRes.data || {};
      const subject = `Bitte E-Mail bestätigen – Terminreservierung ${teacher.name ? 'bei ' + teacher.name : ''}`;
      const plain = `Guten Tag,

bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihre Terminreservierung abschließen können.

Termin: ${slotRow.date} ${slotRow.time}
Lehrkraft: ${teacher.name || '—'}

Bestätigungslink: ${verifyUrl}

Vielen Dank!`;
      const html = `<p>Guten Tag,</p>
<p>bitte bestätigen Sie Ihre E-Mail-Adresse, damit wir Ihre Terminreservierung abschließen können.</p>
<p><strong>Termin:</strong> ${slotRow.date} ${slotRow.time}<br/>
<strong>Lehrkraft:</strong> ${teacher.name || '—'}</p>
<p><a href="${verifyUrl}">E-Mail jetzt bestätigen</a></p>
<p>Vielen Dank!</p>`;
      try {
        await sendMail({ to: payload.email, subject, text: plain, html });
      } catch (e) {
        console.warn('Sending verification email failed:', e?.message || e);
      }
    }

    res.json({ success: true, updatedSlot: mapSlotRow(slotRow) });
  } catch (error) {
    console.error('Error creating booking:', error);
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'Failed to create booking' });
  }
});

// GET /api/bookings/verify/:token - verify email and possibly send confirmation if already accepted
app.get('/api/bookings/verify/:token', async (req, res) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const { slotRow: slot, verifiedAt: now } = await verifyBookingToken(token);

    // If already confirmed and confirmation mail not sent, send now
    if (slot.status === 'confirmed' && !slot.confirmation_sent_at && isEmailConfigured()) {
      try {
        const teacherRes = await supabase.from('teachers').select('*').eq('id', slot.teacher_id).single();
        const teacher = teacherRes.data || {};
        const subject = `Bestätigung: Termin am ${slot.date} (${slot.time})`;
        const plain = `Guten Tag,

Ihre Terminbuchung wurde bestätigt.

Termin: ${slot.date} ${slot.time}
Lehrkraft: ${teacher.name || '—'}
Raum: ${teacher.room || '—'}

Bis bald!`;
        const html = `<p>Guten Tag,</p>
<p>Ihre Terminbuchung wurde bestätigt.</p>
<p><strong>Termin:</strong> ${slot.date} ${slot.time}<br/>
<strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
<strong>Raum:</strong> ${teacher.room || '—'}</p>
<p>Bis bald!</p>`;
        await sendMail({ to: slot.email, subject, text: plain, html });
        await supabase.from('slots').update({ confirmation_sent_at: now, updated_at: now }).eq('id', slot.id);
      } catch (e) {
        console.warn('Sending confirmation after verify failed:', e?.message || e);
      }
    }

    return res.json({ success: true, message: 'E-Mail bestätigt. Wir informieren Sie bei Bestätigung durch die Lehrkraft.' });
  } catch (e) {
    console.error('Error verifying email:', e);
    const status = e?.statusCode || 500;
    return res.status(status).json({ error: e?.message || 'Verifikation fehlgeschlagen' });
  }
});

// Admin Routes (Protected)
// GET /api/admin/bookings - Get all bookings with teacher info
app.get('/api/admin/bookings', requireAuth, async (_req, res) => {
  try {
    const bookings = await listAdminBookings();
    res.json({ bookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// DELETE /api/admin/bookings/:slotId - Cancel a booking
app.delete('/api/admin/bookings/:slotId', requireAuth, async (req, res) => {
  const slotId = parseInt(req.params.slotId, 10);
  
  if (isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slotId' });
  }

  // Clear booking data with Supabase
  try {
    const { previous } = await cancelBookingAdmin(slotId);

    // Best-effort cancellation email (only if the booking email was verified)
    if (previous && previous.email && previous.verified_at && isEmailConfigured()) {
      try {
        const teacherRes = await supabase.from('teachers').select('*').eq('id', previous.teacher_id).single();
        const teacher = teacherRes.data || {};

        const subject = `Stornierung: Termin am ${previous.date} (${previous.time})`;
        const plain = `Guten Tag,

Ihr Termin wurde storniert.

Termin: ${previous.date} ${previous.time}
Lehrkraft: ${teacher.name || '—'}
Raum: ${teacher.room || '—'}

Bei Bedarf können Sie über das Buchungssystem einen neuen Termin buchen.

Viele Grüße`;
        const html = `<p>Guten Tag,</p>
<p>Ihr Termin wurde storniert.</p>
<p><strong>Termin:</strong> ${previous.date} ${previous.time}<br/>
<strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
<strong>Raum:</strong> ${teacher.room || '—'}</p>
<p>Bei Bedarf können Sie über das Buchungssystem einen neuen Termin buchen.</p>
<p>Viele Grüße</p>`;

        await sendMail({ to: previous.email, subject, text: plain, html });
        await supabase.from('slots').update({ cancellation_sent_at: new Date().toISOString() }).eq('id', slotId);
      } catch (e) {
        console.warn('Sending cancellation email (admin) failed:', e?.message || e);
      }
    }

    res.json({ 
      success: true, 
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || 'Failed to cancel booking' });
  }
});

// Helper function to generate time slots
function generateTimeSlots(system) {
  const slots = [];
  let startHour, startMinute, endHour, endMinute;
  
  if (system === 'vollzeit') {
    startHour = 17;
    startMinute = 0;
    endHour = 19;
    endMinute = 0;
  } else { // dual
    startHour = 16;
    startMinute = 0;
    endHour = 18;
    endMinute = 0;
  }
  
  let currentHour = startHour;
  let currentMinute = startMinute;
  
  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
    const endSlotHour = currentMinute === 45 ? currentHour + 1 : currentHour;
    const endSlotMinute = currentMinute === 45 ? 0 : currentMinute + 15;
    
    const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')} - ${String(endSlotHour).padStart(2, '0')}:${String(endSlotMinute).padStart(2, '0')}`;
    slots.push(timeString);
    
    currentMinute += 15;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }
  
  return slots;
}

// POST /api/admin/teachers - Create new teacher (and login user)
app.post('/api/admin/teachers', requireAdmin, async (req, res) => {
  try {
    const { name, email, salutation, subject, system, room, username: reqUsername, password: reqPassword } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const parsedEmail = normalizeAndValidateTeacherEmail(email);
    if (!parsedEmail.ok) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse. Sie muss auf @bksb.nrw enden.' });
    }

    const parsedSalutation = normalizeAndValidateTeacherSalutation(salutation);
    if (!parsedSalutation.ok) {
      return res.status(400).json({ error: 'Ungültige Anrede. Erlaubt: Herr, Frau, Divers.' });
    }

    const teacherSystem = system || 'dual'; // Fallback to dual if not provided

    if (teacherSystem !== 'dual' && teacherSystem !== 'vollzeit') {
      return res.status(400).json({ error: 'system must be "dual" or "vollzeit"' });
    }

    // Create teacher
    const { data: teacher, error: teacherError } = await supabase
      .from('teachers')
      .insert({ 
        name: name.trim(), 
        email: parsedEmail.email,
        salutation: parsedSalutation.salutation,
        subject: subject || 'Sprechstunde', 
        system: teacherSystem,
        room: room ? room.trim() : null
      })
      .select()
      .single();
    
    if (teacherError) throw teacherError;

    // Generate time slots based on system
    const timeSlots = generateTimeSlots(teacherSystem);

    // Prefer: create slots for the currently active (published) event.
    // Fallback: newest event (any status). Last resort: settings.event_date.
    const formatDateDE = (isoOrDate) => {
      const d = new Date(isoOrDate);
      if (Number.isNaN(d.getTime())) return null;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = String(d.getFullYear());
      return `${dd}.${mm}.${yyyy}`;
    };

    let targetEventId = null;
    let eventDate = null;

    try {
      const nowIso = new Date().toISOString();
      const { data: activeEvents, error: activeErr } = await supabase
        .from('events')
        .select('id, starts_at')
        .eq('status', 'published')
        .or(`booking_opens_at.is.null,booking_opens_at.lte.${nowIso}`)
        .or(`booking_closes_at.is.null,booking_closes_at.gte.${nowIso}`)
        .order('starts_at', { ascending: false })
        .limit(1);
      if (activeErr) throw activeErr;
      const activeEvent = activeEvents && activeEvents.length ? activeEvents[0] : null;
      if (activeEvent?.id) {
        targetEventId = activeEvent.id;
        eventDate = formatDateDE(activeEvent.starts_at);
      }
    } catch (e) {
      console.warn('Resolving active event for teacher slots failed:', e?.message || e);
    }

    if (!targetEventId || !eventDate) {
      try {
        const { data: latestEvents, error: latestErr } = await supabase
          .from('events')
          .select('id, starts_at')
          .order('starts_at', { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const latest = latestEvents && latestEvents.length ? latestEvents[0] : null;
        if (latest?.id) {
          targetEventId = latest.id;
          eventDate = formatDateDE(latest.starts_at);
        }
      } catch (e) {
        console.warn('Resolving latest event for teacher slots failed:', e?.message || e);
      }
    }

    if (!eventDate) {
      // Settings fallback: stored as DATE (YYYY-MM-DD)
      try {
        const { data: settings } = await supabase
          .from('settings')
          .select('event_date')
          .limit(1)
          .single();
        if (settings?.event_date) {
          eventDate = formatDateDE(settings.event_date);
        }
      } catch {}
    }

    if (!eventDate) {
      eventDate = formatDateDE(new Date().toISOString()) || '01.01.1970';
    }

    const now = new Date().toISOString();
    const slotsToInsert = timeSlots.map(time => ({
      teacher_id: teacher.id,
      event_id: targetEventId,
      time: time,
      date: eventDate,
      booked: false,
      updated_at: now,
    }));

    const { error: slotsError } = await supabase
      .from('slots')
      .insert(slotsToInsert);
    
    if (slotsError) {
      console.error('Error creating slots:', slotsError);
      // Don't fail the teacher creation if slots fail
    }

    // Create or upsert a linked user account for the teacher
    // Use provided username/password if present; otherwise generate
    const baseUsername = String(reqUsername || teacher.name || `teacher${teacher.id}`)
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 20) || `teacher${teacher.id}`;

    // Ensure uniqueness by appending id if needed
    const username = `${baseUsername}${baseUsername.endsWith(String(teacher.id)) ? '' : teacher.id}`;
    const providedPw = reqPassword && typeof reqPassword === 'string' ? reqPassword.trim() : '';
    const isStrongEnough = providedPw.length >= 8;
    const tempPassword = isStrongEnough
      ? providedPw
      : crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    try {
      await supabase
        .from('users')
        .upsert({
          username,
          password_hash: passwordHash,
          role: 'teacher',
          teacher_id: teacher.id
        }, { onConflict: 'username' });
    } catch (userErr) {
      console.warn('User creation for teacher failed:', userErr?.message || userErr);
    }

    res.json({
      success: true,
      teacher,
      slotsCreated: timeSlots.length,
      slotsEventId: targetEventId,
      slotsEventDate: eventDate,
      user: { username, tempPassword }
    });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// GET /api/admin/teachers - List all teachers (admin only)
app.get('/api/admin/teachers', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .order('id');
    if (error) throw error;
    return res.json({ teachers: data || [] });
  } catch (error) {
    console.error('Error fetching admin teachers:', error);
    return res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// PUT /api/admin/teachers/:id - Update teacher
app.put('/api/admin/teachers/:id', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  try {
    const { name, email, salutation, subject, system, room } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const parsedEmail = normalizeAndValidateTeacherEmail(email);
    if (!parsedEmail.ok) {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse. Sie muss auf @bksb.nrw enden.' });
    }

    const parsedSalutation = normalizeAndValidateTeacherSalutation(salutation);
    if (!parsedSalutation.ok) {
      return res.status(400).json({ error: 'Ungültige Anrede. Erlaubt: Herr, Frau, Divers.' });
    }

    const teacherSystem = system || 'dual'; // Fallback to dual if not provided

    if (teacherSystem !== 'dual' && teacherSystem !== 'vollzeit') {
      return res.status(400).json({ error: 'system must be "dual" or "vollzeit"' });
    }

    const { data, error } = await supabase
      .from('teachers')
      .update({ 
        name: name.trim(), 
        email: parsedEmail.email,
        salutation: parsedSalutation.salutation,
        subject: subject || 'Sprechstunde', 
        system: teacherSystem,
        room: room ? room.trim() : null
      })
      .eq('id', teacherId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      throw error;
    }

    res.json({ success: true, teacher: data });
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

// PUT /api/admin/teachers/:id/reset-login - Regenerate teacher user's temp password
app.put('/api/admin/teachers/:id/reset-login', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  try {
    // Find user for this teacher
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('teacher_id', teacherId)
      .limit(1);
    if (userErr) throw userErr;

    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'Kein Benutzer für diese Lehrkraft gefunden' });
    }

    const user = users[0];
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const { error: upErr } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);
    if (upErr) throw upErr;

    res.json({ success: true, user: { username: user.username, tempPassword } });
  } catch (error) {
    console.error('Error resetting teacher login:', error);
    res.status(500).json({ error: 'Failed to reset teacher login' });
  }
});

// DELETE /api/admin/teachers/:id - Delete teacher
app.delete('/api/admin/teachers/:id', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  try {
    // Check if teacher has any booked slots
    const { data: bookedSlots, error: slotsError } = await supabase
      .from('slots')
      .select('id, booked')
      .eq('teacher_id', teacherId);

    if (slotsError) throw slotsError;

    const hasBookedSlots = bookedSlots && bookedSlots.some(slot => slot.booked);
    
    if (hasBookedSlots) {
      return res.status(400).json({ 
        error: 'Lehrkraft kann nicht gelöscht werden, da noch gebuchte Termine existieren. Bitte zuerst alle gebuchten Termine stornieren.' 
      });
    }

    // Delete all available (unbooked) slots first
    if (bookedSlots && bookedSlots.length > 0) {
      const { error: deleteError } = await supabase
        .from('slots')
        .delete()
        .eq('teacher_id', teacherId);
      
      if (deleteError) throw deleteError;
    }

    // Now delete the teacher
    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('id', teacherId);
    
    if (error) throw error;

    res.json({ 
      success: true, 
      message: 'Teacher deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// GET /api/admin/settings - Get event settings
app.get('/api/admin/settings', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No settings found, return default
        return res.json({
          id: 1,
          event_name: 'BKSB Elternsprechtag',
          event_date: new Date().toISOString().split('T')[0]
        });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/admin/settings - Update event settings
app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { event_name, event_date } = req.body || {};

    if (!event_name || !event_date) {
      return res.status(400).json({ error: 'event_name and event_date required' });
    }

    // Update or insert settings
    const { data, error } = await supabase
      .from('settings')
      .upsert({ 
        id: 1, 
        event_name: event_name.trim(), 
        event_date,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;

    res.json({ success: true, settings: data });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// POST /api/admin/slots - Create new slot
app.post('/api/admin/slots', requireAdmin, async (req, res) => {
  try {
    const { teacher_id, time, date } = req.body || {};

    if (!teacher_id || !time || !date) {
      return res.status(400).json({ error: 'teacher_id, time, and date required' });
    }

    const { data, error} = await supabase
      .from('slots')
      .insert({
        teacher_id,
        time: time.trim(),
        date: date.trim(),
        booked: false
      })
      .select()
      .single();
    
    if (error) throw error;

    res.json({ success: true, slot: data });
  } catch (error) {
    console.error('Error creating slot:', error);
    res.status(500).json({ error: 'Failed to create slot' });
  }
});

// PUT /api/admin/slots/:id - Update slot
app.put('/api/admin/slots/:id', requireAdmin, async (req, res) => {
  const slotId = parseInt(req.params.id, 10);
  
  if (isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slot ID' });
  }

  try {
    const { time, date } = req.body || {};

    if (!time || !date) {
      return res.status(400).json({ error: 'time and date required' });
    }

    const { data, error } = await supabase
      .from('slots')
      .update({ 
        time: time.trim(), 
        date: date.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', slotId)
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found' });
      }
      throw error;
    }

    res.json({ success: true, slot: data });
  } catch (error) {
    console.error('Error updating slot:', error);
    res.status(500).json({ error: 'Failed to update slot' });
  }
});

// DELETE /api/admin/slots/:id - Delete slot
app.delete('/api/admin/slots/:id', requireAdmin, async (req, res) => {
  const slotId = parseInt(req.params.id, 10);
  
  if (isNaN(slotId)) {
    return res.status(400).json({ error: 'Invalid slot ID' });
  }

  try {
    const { error } = await supabase
      .from('slots')
      .delete()
      .eq('id', slotId);
    
    if (error) throw error;

    res.json({ 
      success: true, 
      message: 'Slot deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting slot:', error);
    res.status(500).json({ error: 'Failed to delete slot' });
  }
});

// POST /api/admin/teachers/:id/generate-slots
// Create all default (15-min) slots for a single teacher for the active (published) event.
// Falls back to latest event, then settings.event_date, then today.
app.post('/api/admin/teachers/:id/generate-slots', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  const formatDateDE = (isoOrDate) => {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
  };

  try {
    const { data: teacherRow, error: teacherErr } = await supabase
      .from('teachers')
      .select('id, system')
      .eq('id', teacherId)
      .single();
    if (teacherErr) {
      if (teacherErr.code === 'PGRST116') return res.status(404).json({ error: 'Teacher not found' });
      throw teacherErr;
    }
    if (!teacherRow) return res.status(404).json({ error: 'Teacher not found' });

    const nowIso = new Date().toISOString();
    let targetEventId = null;
    let eventDate = null;

    try {
      const { data: activeEvents, error: activeErr } = await supabase
        .from('events')
        .select('id, starts_at')
        .eq('status', 'published')
        .or(`booking_opens_at.is.null,booking_opens_at.lte.${nowIso}`)
        .or(`booking_closes_at.is.null,booking_closes_at.gte.${nowIso}`)
        .order('starts_at', { ascending: false })
        .limit(1);
      if (activeErr) throw activeErr;
      const activeEvent = activeEvents && activeEvents.length ? activeEvents[0] : null;
      if (activeEvent?.id) {
        targetEventId = activeEvent.id;
        eventDate = formatDateDE(activeEvent.starts_at);
      }
    } catch (e) {
      console.warn('Resolving active event for teacher slot generation failed:', e?.message || e);
    }

    if (!targetEventId || !eventDate) {
      try {
        const { data: latestEvents, error: latestErr } = await supabase
          .from('events')
          .select('id, starts_at')
          .order('starts_at', { ascending: false })
          .limit(1);
        if (latestErr) throw latestErr;
        const latest = latestEvents && latestEvents.length ? latestEvents[0] : null;
        if (latest?.id) {
          targetEventId = latest.id;
          eventDate = formatDateDE(latest.starts_at);
        }
      } catch (e) {
        console.warn('Resolving latest event for teacher slot generation failed:', e?.message || e);
      }
    }

    if (!eventDate) {
      // Settings fallback: stored as DATE (YYYY-MM-DD)
      try {
        const { data: settings } = await supabase
          .from('settings')
          .select('event_date')
          .limit(1)
          .single();
        if (settings?.event_date) {
          eventDate = formatDateDE(settings.event_date);
        }
      } catch {}
    }

    if (!eventDate) {
      eventDate = formatDateDE(new Date().toISOString()) || '01.01.1970';
    }

    const teacherSystem = teacherRow.system || 'dual';
    const times = generateTimeSlots(teacherSystem);
    const now = new Date().toISOString();

    // Fetch existing slots for this teacher for the resolved scope to avoid duplicates
    let existingQuery = supabase
      .from('slots')
      .select('time')
      .eq('teacher_id', teacherId)
      .eq('date', eventDate);

    if (targetEventId === null) {
      existingQuery = existingQuery.is('event_id', null);
    } else {
      existingQuery = existingQuery.eq('event_id', targetEventId);
    }

    const { data: existingSlots, error: existingErr } = await existingQuery;
    if (existingErr) throw existingErr;
    const existingTimes = new Set((existingSlots || []).map((s) => s.time));

    const inserts = [];
    let skipped = 0;
    for (const time of times) {
      if (existingTimes.has(time)) {
        skipped += 1;
        continue;
      }
      inserts.push({
        teacher_id: teacherId,
        event_id: targetEventId,
        time,
        date: eventDate,
        booked: false,
        updated_at: now,
      });
    }

    if (inserts.length) {
      const { error: insErr } = await supabase.from('slots').insert(inserts);
      if (insErr) throw insErr;
    }

    return res.json({
      success: true,
      teacherId,
      eventId: targetEventId,
      eventDate,
      created: inserts.length,
      skipped,
    });
  } catch (error) {
    console.error('Error generating slots for teacher:', error);
    return res.status(500).json({ error: 'Failed to generate slots for teacher' });
  }
});

// Health / readiness route
app.get('/api/health', async (_req, res) => {
  try {
    const [teacherResult, slotResult, bookedResult] = await Promise.all([
      supabase.from('teachers').select('id', { count: 'exact', head: true }),
      supabase.from('slots').select('id', { count: 'exact', head: true }),
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('booked', true)
    ]);

    res.json({ 
      status: 'ok', 
      teacherCount: teacherResult.count || 0, 
      slotCount: slotResult.count || 0,
      bookedCount: bookedResult.count || 0
    });
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
  }
});

// EVENTS
// Public: get the currently active (published) event
app.get('/api/events/active', async (_req, res) => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'published')
      .or(`booking_opens_at.is.null,booking_opens_at.lte.${now}`)
      .or(`booking_closes_at.is.null,booking_closes_at.gte.${now}`)
      .order('starts_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    const activeEvent = data && data.length ? data[0] : null;
    res.json({ event: activeEvent });
  } catch (error) {
    console.error('Error fetching active event:', error);
    res.status(500).json({ error: 'Failed to fetch active event' });
  }
});

// Admin: list events
app.get('/api/admin/events', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: false });
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Admin: create event
app.post('/api/admin/events', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, school_year, starts_at, ends_at, timezone, booking_opens_at, booking_closes_at, status } = req.body || {};
    if (!name || !school_year || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'name, school_year, starts_at, ends_at required' });
    }

    const payload = {
      name,
      school_year,
      starts_at,
      ends_at,
      timezone: timezone || 'Europe/Berlin',
      status: status || 'draft',
      booking_opens_at: booking_opens_at || null,
      booking_closes_at: booking_closes_at || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('events')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Admin: update event (including publish/close)
app.put('/api/admin/events/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('events')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Admin: delete event
app.delete('/api/admin/events/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Admin: event stats (slot counts)
// GET /api/admin/events/:id/stats
app.get('/api/admin/events/:id/stats', requireAuth, requireAdmin, async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Validate event exists (keeps errors clearer)
    const { data: eventRow, error: eventErr } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .single();
    if (eventErr) throw eventErr;
    if (!eventRow) return res.status(404).json({ error: 'Event not found' });

    const [
      totalRes,
      availableRes,
      bookedRes,
      reservedRes,
      confirmedRes,
    ] = await Promise.all([
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('booked', false),
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('booked', true),
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'reserved'),
      supabase.from('slots').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'confirmed'),
    ]);

    // Any error in the batch -> throw
    if (totalRes.error) throw totalRes.error;
    if (availableRes.error) throw availableRes.error;
    if (bookedRes.error) throw bookedRes.error;
    if (reservedRes.error) throw reservedRes.error;
    if (confirmedRes.error) throw confirmedRes.error;

    res.json({
      eventId,
      totalSlots: totalRes.count || 0,
      availableSlots: availableRes.count || 0,
      bookedSlots: bookedRes.count || 0,
      reservedSlots: reservedRes.count || 0,
      confirmedSlots: confirmedRes.count || 0,
    });
  } catch (error) {
    console.error('Error fetching event stats:', error);
    res.status(500).json({ error: 'Failed to fetch event stats' });
  }
});

// Admin: generate slots for a specific event (single-day events)
// POST /api/admin/events/:id/generate-slots
// Body (optional): { slotMinutes?: number, dryRun?: boolean, replaceExisting?: boolean }
app.post('/api/admin/events/:id/generate-slots', requireAuth, requireAdmin, async (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid id' });

  const { slotMinutes, dryRun, replaceExisting } = req.body || {};
  const slotLen = Number(slotMinutes || 15);
  if (!Number.isFinite(slotLen) || slotLen < 5 || slotLen > 60) {
    return res.status(400).json({ error: 'slotMinutes must be between 5 and 60' });
  }

  const formatDateDE = (isoOrDate) => {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const toMinutes = (h, m) => h * 60 + m;
  const minutesToHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${pad2(h)}:${pad2(m)}`;
  };

  try {
    const { data: eventRow, error: eventErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single();
    if (eventErr) throw eventErr;
    if (!eventRow) return res.status(404).json({ error: 'Event not found' });

    const eventDate = formatDateDE(eventRow.starts_at);
    if (!eventDate) return res.status(400).json({ error: 'Event starts_at is invalid' });

    // Optional: replace existing slots for this event day
    if (replaceExisting) {
      if (!dryRun) {
        const { error: delErr } = await supabase
          .from('slots')
          .delete()
          .eq('event_id', eventId)
          .eq('date', eventDate);
        if (delErr) throw delErr;
      }
    }

    const { data: teachers, error: teachersErr } = await supabase
      .from('teachers')
      .select('id, system');
    if (teachersErr) throw teachersErr;

    const teacherRows = teachers || [];
    if (!teacherRows.length) return res.json({ success: true, created: 0, skipped: 0, eventDate });

    let created = 0;
    let skipped = 0;

    for (const t of teacherRows) {
      const teacherSystem = t.system || 'dual';
      const windowStart = teacherSystem === 'vollzeit' ? toMinutes(17, 0) : toMinutes(16, 0);
      const windowEnd = teacherSystem === 'vollzeit' ? toMinutes(19, 0) : toMinutes(18, 0);

      // Fetch existing slots for this teacher+event+date to avoid duplicates
      const { data: existingSlots, error: existingErr } = await supabase
        .from('slots')
        .select('time')
        .eq('teacher_id', t.id)
        .eq('event_id', eventId)
        .eq('date', eventDate);
      if (existingErr) throw existingErr;
      const existingTimes = new Set((existingSlots || []).map((s) => s.time));

      const inserts = [];
      for (let start = windowStart; start + slotLen <= windowEnd; start += slotLen) {
        const end = start + slotLen;
        const time = `${minutesToHHMM(start)} - ${minutesToHHMM(end)}`;
        if (existingTimes.has(time)) {
          skipped += 1;
          continue;
        }
        inserts.push({
          teacher_id: t.id,
          event_id: eventId,
          date: eventDate,
          time,
          booked: false,
          updated_at: new Date().toISOString(),
        });
      }

      if (inserts.length) {
        if (!dryRun) {
          const { error: insErr } = await supabase.from('slots').insert(inserts);
          if (insErr) throw insErr;
        }
        created += inserts.length;
      }
    }

    return res.json({ success: true, eventId, eventDate, created, skipped, dryRun: Boolean(dryRun), replaceExisting: Boolean(replaceExisting) });
  } catch (error) {
    console.error('Error generating slots for event:', error);
    return res.status(500).json({ error: 'Failed to generate slots for event' });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  const printedHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Backend listening on http://${printedHost}:${PORT}`);
});

/*
Frontend Usage Examples (Fetch):

fetch('http://localhost:4000/api/teachers')
  .then(r => r.json())
  .then(data => console.log(data.teachers));

fetch('http://localhost:4000/api/slots?teacherId=t1')
  .then(r => r.json())
  .then(data => console.log(data.slots));

fetch('http://localhost:4000/api/bookings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slotId: 's1',
    parentName: 'Familie Beispiel',
    studentName: 'Max Beispiel',
    className: '5a'
  })
}).then(r => r.json()).then(data => console.log(data));

To extend to DB later: replace in-memory arrays with a data access layer (e.g. services/db.js) and swap implementations without changing route handlers.
*/
