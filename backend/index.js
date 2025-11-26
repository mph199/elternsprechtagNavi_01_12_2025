import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import { supabase } from './config/supabase.js';

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
  },
  credentials: true
}));
app.use(express.json());

// Session configuration
// Enable trust proxy for secure cookies behind Render/Vercel proxies
app.set('trust proxy', 1);

// Configure session cookies for cross-origin usage (Vercel <-> Render)
const isProduction = process.env.NODE_ENV === 'production' || (process.env.FRONTEND_URL || '').startsWith('https://');
app.use(session({
  secret: process.env.SESSION_SECRET || 'bksb-elternsprechtag-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // requires HTTPS
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // allow cross-site cookies in prod
    maxAge: 8 * 60 * 60 * 1000 // 8 hours
  }
}));

// Simple request logging (can be replaced by morgan later)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Auth Routes
app.use('/api/auth', authRoutes);

// Public Routes
// GET /api/teachers
app.get('/api/teachers', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .order('id');
    
    if (error) throw error;
    res.json({ teachers: data });
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

    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .eq('teacher_id', teacherIdNum)
      .order('time');
    
    if (error) throw error;
    
    // Map snake_case to camelCase for frontend compatibility
    const slots = data.map(slot => ({
      id: slot.id,
      teacherId: slot.teacher_id,
      time: slot.time,
      date: slot.date,
      booked: slot.booked,
      parentName: slot.parent_name,
      studentName: slot.student_name,
      className: slot.class_name
    }));
    
    res.json({ slots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ error: 'Failed to fetch slots' });
  }
});

// POST /api/bookings
// Body: { slotId, parentName, studentName, className }
app.post('/api/bookings', async (req, res) => {
  try {
    const { slotId, parentName, studentName, className } = req.body || {};

    if (!slotId || !parentName || !studentName || !className) {
      return res.status(400).json({ error: 'slotId, parentName, studentName, className required' });
    }

    const { data, error } = await supabase
      .from('slots')
      .update({
        booked: true,
        parent_name: parentName,
        student_name: studentName,
        class_name: className
      })
      .eq('id', slotId)
      .eq('booked', false) // Prevent double-booking
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(409).json({ error: 'Slot already booked or not found' });
      }
      throw error;
    }
    
    // Map to camelCase for response
    const updatedSlot = {
      id: data.id,
      teacherId: data.teacher_id,
      time: data.time,
      date: data.date,
      booked: data.booked,
      parentName: data.parent_name,
      studentName: data.student_name,
      className: data.class_name
    };
    
    res.json({ success: true, updatedSlot });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Admin Routes (Protected)
// GET /api/admin/bookings - Get all bookings with teacher info
app.get('/api/admin/bookings', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('slots')
      .select(`
        *,
        teacher:teachers(name, subject)
      `)
      .eq('booked', true)
      .order('date')
      .order('time');
    
    if (error) throw error;
    
    // Map to camelCase with teacher info
    const bookings = data.map(slot => ({
      id: slot.id,
      teacherId: slot.teacher_id,
      time: slot.time,
      date: slot.date,
      booked: slot.booked,
      parentName: slot.parent_name,
      studentName: slot.student_name,
      className: slot.class_name,
      teacherName: slot.teacher?.name || 'Unknown',
      teacherSubject: slot.teacher?.subject || 'Unknown'
    }));
  
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
    const { data, error } = await supabase
      .from('slots')
      .update({
        booked: false,
        parent_name: null,
        student_name: null,
        class_name: null
      })
      .eq('id', slotId)
      .eq('booked', true) // Only cancel if booked
      .select()
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Slot not found or not booked' });
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

// POST /api/admin/teachers - Create new teacher
app.post('/api/admin/teachers', requireAdmin, async (req, res) => {
  try {
    const { name, subject, system } = req.body || {};

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
      .insert({ name: name.trim(), subject: subject || 'Sprechstunde', system: teacherSystem })
      .select()
      .single();
    
    if (teacherError) throw teacherError;

    // Generate time slots based on system
    const timeSlots = generateTimeSlots(teacherSystem);
    
    // Create slots for the teacher
    // Default date can be set later by admin
    const currentDate = new Date();
    const dateString = currentDate.toLocaleDateString('de-DE');
    
    const slotsToInsert = timeSlots.map(time => ({
      teacher_id: teacher.id,
      time: time,
      date: dateString,
      booked: false
    }));

    const { error: slotsError } = await supabase
      .from('slots')
      .insert(slotsToInsert);
    
    if (slotsError) {
      console.error('Error creating slots:', slotsError);
      // Don't fail the teacher creation if slots fail
    }

    res.json({ success: true, teacher, slotsCreated: timeSlots.length });
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
    const { name, subject, system } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const teacherSystem = system || 'dual'; // Fallback to dual if not provided

    if (teacherSystem !== 'dual' && teacherSystem !== 'vollzeit') {
      return res.status(400).json({ error: 'system must be "dual" or "vollzeit"' });
    }

    const { data, error } = await supabase
      .from('teachers')
      .update({ name: name.trim(), subject: subject || 'Sprechstunde', system: teacherSystem })
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

// DELETE /api/admin/teachers/:id - Delete teacher
app.delete('/api/admin/teachers/:id', requireAdmin, async (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  
  if (isNaN(teacherId)) {
    return res.status(400).json({ error: 'Invalid teacher ID' });
  }

  try {
    // Check if teacher has any slots
    const { count } = await supabase
      .from('slots')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', teacherId);

    if (count && count > 0) {
      return res.status(400).json({ 
        error: 'Lehrkraft kann nicht gelöscht werden, da noch Termine existieren. Bitte zuerst alle Termine löschen.' 
      });
    }

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

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
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
