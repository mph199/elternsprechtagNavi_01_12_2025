import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import teacherRoutes from './routes/teacher.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { supabase } from './config/supabase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { isEmailConfigured, sendMail } from './config/email.js';
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

// GET /api/slots?teacherId=1
app.get('/api/slots', async (req, res) => {
  try {
    const { teacherId } = req.query;
    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId query param required' });
    }
    const teacherIdNum = parseInt(teacherId, 10);
    if (isNaN(teacherIdNum)) {
      return res.status(400).json({ error: 'teacherId must be a number' });
    }

    const slots = await listSlotsByTeacherId(teacherIdNum);
    res.json({ slots });
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
    const { slotRow, verificationToken } = await reserveBooking(payload);

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
    await cancelBookingAdmin(slotId);

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
    const { name, subject, system, room, username: reqUsername, password: reqPassword } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name required' });
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
        subject: subject || 'Sprechstunde', 
        system: teacherSystem,
        room: room ? room.trim() : null
      })
      .select()
      .single();
    
    if (teacherError) throw teacherError;

    // Generate time slots based on system
    const timeSlots = generateTimeSlots(teacherSystem);

    // Use event date from settings, fallback to today (ISO YYYY-MM-DD)
    let eventDate = new Date().toISOString().split('T')[0];
    try {
      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();
      if (settings && settings.event_date) {
        eventDate = settings.event_date;
      }
    } catch {}

    const slotsToInsert = timeSlots.map(time => ({
      teacher_id: teacher.id,
      time: time,
      date: eventDate,
      booked: false
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

    res.json({ success: true, teacher, slotsCreated: timeSlots.length, user: { username, tempPassword } });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// PUT /api/admin/teachers/:id - Update teacher
app.put('/api/admin/teachers/:id', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  try {
    const { name, subject, system, room } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const teacherSystem = system || 'dual'; // Fallback to dual if not provided

    if (teacherSystem !== 'dual' && teacherSystem !== 'vollzeit') {
      return res.status(400).json({ error: 'system must be "dual" or "vollzeit"' });
    }

    const { data, error } = await supabase
      .from('teachers')
      .update({ 
        name: name.trim(), 
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
