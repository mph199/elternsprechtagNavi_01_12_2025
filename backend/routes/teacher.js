import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { isEmailConfigured, sendMail } from '../config/email.js';
import bcrypt from 'bcryptjs';
import { mapSlotRow, mapBookingRowWithTeacher, mapBookingRequestRow } from '../utils/mappers.js';

function buildHalfHourWindows(startHour, endHour) {
  const windows = [];
  const pad2 = (n) => String(n).padStart(2, '0');
  const toMins = (h, m) => h * 60 + m;
  const fmt = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;

  const start = toMins(startHour, 0);
  const end = toMins(endHour, 0);
  for (let m = start; m + 30 <= end; m += 30) {
    windows.push(`${fmt(m)} - ${fmt(m + 30)}`);
  }
  return windows;
}

function getRequestedTimeWindowsForSystem(system) {
  if (system === 'vollzeit') {
    return buildHalfHourWindows(17, 19);
  }
  return buildHalfHourWindows(16, 18);
}

function parseTimeWindow(timeWindow) {
  if (typeof timeWindow !== 'string') return null;
  const m = timeWindow.trim().match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
  const end = Number.parseInt(m[3], 10) * 60 + Number.parseInt(m[4], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function fmtMinutes(mins) {
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildAssignableSlotTimesFromRequestedWindow(requestedTime) {
  const parsed = parseTimeWindow(requestedTime);
  if (!parsed) return [];

  const times = [];
  for (let m = parsed.start; m + 15 <= parsed.end; m += 15) {
    times.push(`${fmtMinutes(m)} - ${fmtMinutes(m + 15)}`);
  }

  // Backward compatibility: if a legacy 15-min request is stored, keep it assignable.
  if (!times.length && parsed.end - parsed.start === 15) {
    return [`${fmtMinutes(parsed.start)} - ${fmtMinutes(parsed.end)}`];
  }
  return times;
}

function buildAssignableSlotTimesForSystem(system) {
  const windows = getRequestedTimeWindowsForSystem(system);
  const result = [];
  for (const window of windows) {
    for (const t of buildAssignableSlotTimesFromRequestedWindow(window)) {
      if (!result.includes(t)) result.push(t);
    }
  }
  return result;
}

async function getTeacherSystem(teacherId) {
  const { data, error } = await supabase
    .from('teachers')
    .select('system')
    .eq('id', teacherId)
    .single();
  if (error) throw error;
  return data?.system === 'vollzeit' ? 'vollzeit' : 'dual';
}

function isValidSlotTimeRange(value) {
  return /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/.test(String(value || '').trim());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickPreferredSlot(slotRows, orderedTimes, eventId) {
  const rows = slotRows || [];

  for (const t of orderedTimes) {
    if (eventId != null) {
      const exact = rows.find((r) => r.time === t && r.event_id === eventId);
      if (exact) return exact;
      const legacy = rows.find((r) => r.time === t && r.event_id == null);
      if (legacy) return legacy;
      continue;
    }

    const nullScoped = rows.find((r) => r.time === t && r.event_id == null);
    if (nullScoped) return nullScoped;
    const anyScoped = rows.find((r) => r.time === t);
    if (anyScoped) return anyScoped;
  }

  return null;
}

async function sendRequestConfirmationIfPossible(updatedSlot, requestRow, teacherId, now, teacherMessage = '') {
  if (!updatedSlot?.email || !isEmailConfigured()) return;

  try {
    const teacherRes = await supabase.from('teachers').select('*').eq('id', teacherId).single();
    const teacher = teacherRes.data || {};
    const safeTeacherMessage = String(teacherMessage || '').trim();
    const teacherMessagePlain = safeTeacherMessage
      ? `\n\nNachricht der Lehrkraft:\n${safeTeacherMessage}`
      : '';
    const teacherMessageHtml = safeTeacherMessage
      ? `<p><strong>Nachricht der Lehrkraft:</strong><br/>${escapeHtml(safeTeacherMessage).replace(/\n/g, '<br/>')}</p>`
      : '';
    const subject = `BKSB Elternsprechtag – Termin bestätigt am ${updatedSlot.date} (${updatedSlot.time})`;
    const plain = `Guten Tag,

Ihre Terminanfrage wurde durch die Lehrkraft angenommen.

Termin: ${updatedSlot.date} ${updatedSlot.time}
Lehrkraft: ${teacher.name || '—'}
Raum: ${teacher.room || '—'}

${teacherMessagePlain}

Mit freundlichen Grüßen

Ihr BKSB-Team`;
    const html = `<p>Guten Tag,</p>
<p>Ihre Terminanfrage wurde durch die Lehrkraft angenommen.</p>
<p><strong>Termin:</strong> ${updatedSlot.date} ${updatedSlot.time}<br/>
<strong>Lehrkraft:</strong> ${teacher.name || '—'}<br/>
<strong>Raum:</strong> ${teacher.room || '—'}</p>
${teacherMessageHtml}
<p>Mit freundlichen Grüßen</p>
<p>Ihr BKSB-Team</p>`;

    await sendMail({ to: updatedSlot.email, subject, text: plain, html });
    await supabase.from('slots').update({ confirmation_sent_at: now }).eq('id', updatedSlot.id);
    await supabase.from('booking_requests').update({ confirmation_sent_at: now, updated_at: now }).eq('id', requestRow.id);
  } catch (e) {
    console.warn('Sending request confirmation email failed:', e?.message || e);
  }
}

async function assignRequestToSlot(current, teacherId, preferredTime = null, teacherMessage = '', teacherSystem = null) {
  const resolvedTeacherSystem = teacherSystem || (await getTeacherSystem(teacherId));
  const allowedTimes = buildAssignableSlotTimesForSystem(resolvedTeacherSystem);
  const allowedSet = new Set(allowedTimes);

  const candidateTimes = buildAssignableSlotTimesFromRequestedWindow(current.requested_time);
  const normalizedPreferredTime = typeof preferredTime === 'string' ? preferredTime.trim() : '';
  if (normalizedPreferredTime && !isValidSlotTimeRange(normalizedPreferredTime)) {
    return { ok: false, code: 'INVALID_TIME_SELECTION', candidateTimes: allowedTimes };
  }

  if (!candidateTimes.length && !normalizedPreferredTime) {
    return { ok: false, code: 'INVALID_REQUEST_WINDOW' };
  }

  const orderedTimes = [];
  if (normalizedPreferredTime) orderedTimes.push(normalizedPreferredTime);
  for (const t of candidateTimes) {
    if (!orderedTimes.includes(t)) orderedTimes.push(t);
  }

  const systemConformTimes = orderedTimes.filter((time) => allowedSet.has(time));

  if (!systemConformTimes.length) {
    return { ok: false, code: 'INVALID_TIME_SELECTION', candidateTimes: allowedTimes };
  }

  const { data: slotRows, error: slotErr } = await supabase
    .from('slots')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('date', current.date)
    .eq('booked', false)
    .in('time', systemConformTimes)
    .limit(50);
  if (slotErr) throw slotErr;

  const slot = pickPreferredSlot(slotRows, systemConformTimes, current.event_id ?? null);
  if (!slot) {
    const eventIds = Array.from(new Set((slotRows || []).map((r) => r.event_id)));
    return {
      ok: false,
      code: 'NO_SLOT_AVAILABLE',
      details: {
        requestEventId: current.event_id ?? null,
        teacherId,
        teacherSystem: resolvedTeacherSystem,
        date: current.date,
        requestedTime: current.requested_time,
        candidateTimes: systemConformTimes,
        matchingSlotsFound: (slotRows || []).length,
        matchingEventIds: eventIds,
      },
    };
  }

  const now = new Date().toISOString();
  const slotUpdate = {
    event_id: current.event_id ?? slot.event_id ?? null,
    booked: true,
    status: 'confirmed',
    visitor_type: current.visitor_type,
    class_name: current.class_name,
    email: current.email,
    message: current.message || null,
    parent_name: current.parent_name,
    student_name: current.student_name,
    company_name: current.company_name,
    trainee_name: current.trainee_name,
    representative_name: current.representative_name,
    verified_at: current.verified_at,
    verification_token: null,
    verification_token_hash: null,
    verification_sent_at: null,
    updated_at: now,
  };

  const { data: updatedSlot, error: updErr } = await supabase
    .from('slots')
    .update(slotUpdate)
    .eq('id', slot.id)
    .eq('teacher_id', teacherId)
    .eq('booked', false)
    .select('*')
    .single();

  if (updErr) {
    if (updErr.code === 'PGRST116') {
      return { ok: false, code: 'SLOT_ALREADY_BOOKED' };
    }
    throw updErr;
  }

  const { data: updatedReq, error: reqUpdErr } = await supabase
    .from('booking_requests')
    .update({ status: 'accepted', assigned_slot_id: updatedSlot.id, updated_at: now })
    .eq('id', current.id)
    .eq('teacher_id', teacherId)
    .eq('status', 'requested')
    .select('*')
    .single();

  if (reqUpdErr) {
    if (reqUpdErr.code === 'PGRST116') {
      return { ok: false, code: 'REQUEST_NOT_PENDING_ANYMORE' };
    }
    throw reqUpdErr;
  }

  await sendRequestConfirmationIfPossible(updatedSlot, updatedReq, teacherId, now, teacherMessage);
  return { ok: true, updatedSlot, updatedReq };
}

async function autoAssignOverdueRequestsForTeacher(teacherId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: overdueRequests, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('status', 'requested')
    .not('verified_at', 'is', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;

  for (const reqRow of overdueRequests || []) {
    try {
      await assignRequestToSlot(reqRow, teacherId, null);
    } catch (e) {
      console.warn('Auto-assignment for overdue request failed:', e?.message || e);
    }
  }
}

async function autoAssignOverdueRequestsGlobal() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: overdueRequests, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('status', 'requested')
    .not('verified_at', 'is', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw error;

  for (const reqRow of overdueRequests || []) {
    try {
      await assignRequestToSlot(reqRow, reqRow.teacher_id, null);
    } catch (e) {
      console.warn('Global auto-assignment failed:', e?.message || e);
    }
  }
}

const autoAssignIntervalMs = 5 * 60 * 1000;
const autoAssignTimer = setInterval(() => {
  autoAssignOverdueRequestsGlobal().catch((e) => {
    console.warn('Auto-assignment sweep failed:', e?.message || e);
  });
}, autoAssignIntervalMs);

if (typeof autoAssignTimer.unref === 'function') {
  autoAssignTimer.unref();
}

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
 * GET /api/teacher/requests
 * Get all pending booking requests for the logged-in teacher
 */
router.get('/requests', requireAuth, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const teacherSystem = await getTeacherSystem(teacherId);
    const allowedSet = new Set(buildAssignableSlotTimesForSystem(teacherSystem));

    // Auto-assign verified requests older than 24h to the earliest free slot.
    await autoAssignOverdueRequestsForTeacher(teacherId);

    const { data, error } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('status', 'requested')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    return res.json({
      requests: await (async () => {
        const rows = data || [];
        const dates = Array.from(new Set(rows.map((row) => row.date).filter(Boolean)));

        let allFreeSlots = [];
        if (dates.length) {
          const { data: freeSlotRows, error: freeSlotErr } = await supabase
            .from('slots')
            .select('time, date')
            .eq('teacher_id', teacherId)
            .eq('booked', false)
            .in('date', dates)
            .order('time', { ascending: true })
            .limit(3000);
          if (freeSlotErr) throw freeSlotErr;
          allFreeSlots = freeSlotRows || [];
        }

        return rows.map((row) => {
          const scopedFreeTimes = allFreeSlots
            .filter((slot) => slot.date === row.date)
            .map((slot) => slot.time)
            .filter((time) => allowedSet.has(time))
            .filter((value, index, arr) => arr.indexOf(value) === index);

          return {
            ...mapBookingRequestRow(row),
            assignableTimes: buildAssignableSlotTimesFromRequestedWindow(row.requested_time),
            availableTimes: scopedFreeTimes,
          };
        });
      })(),
    });
  } catch (error) {
    console.error('Error fetching teacher requests:', error);
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

/**
 * PUT /api/teacher/requests/:id/accept
 * Accept a verified booking request and assign it to a slot
 * Body (optional): { time?: string, teacherMessage?: string }
 */
router.put('/requests/:id/accept', requireAuth, requireTeacher, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  try {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const { data: current, error: curErr } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('id', requestId)
      .eq('teacher_id', teacherId)
      .single();

    if (curErr) {
      if (curErr.code === 'PGRST116') {
        return res.status(404).json({ error: 'Request not found' });
      }
      throw curErr;
    }

    if (current.status === 'accepted') {
      return res.json({ success: true, request: mapBookingRequestRow(current) });
    }

    if (current.status !== 'requested') {
      return res.status(409).json({ error: 'Request is not pending' });
    }

    if (!current.verified_at) {
      return res.status(409).json({
        error: 'Anfrage kann erst angenommen werden, nachdem die E-Mail-Adresse verifiziert wurde',
      });
    }

    const rawTime = typeof req.body?.time === 'string' ? req.body.time.trim() : '';
    const rawTeacherMessage = typeof req.body?.teacherMessage === 'string' ? req.body.teacherMessage.trim() : '';
    if (rawTeacherMessage.length > 1000) {
      return res.status(400).json({ error: 'Nachricht der Lehrkraft darf maximal 1000 Zeichen lang sein' });
    }

    const assignment = await assignRequestToSlot(current, teacherId, rawTime || null, rawTeacherMessage || '');
    if (!assignment.ok) {
      if (assignment.code === 'INVALID_TIME_SELECTION') {
        return res.status(400).json({ error: 'Ungültige Zeit-Auswahl', assignableTimes: assignment.candidateTimes || [] });
      }
      if (assignment.code === 'INVALID_REQUEST_WINDOW') {
        return res.status(400).json({ error: 'Anfrage-Zeitraum ist ungültig' });
      }
      if (assignment.code === 'NO_SLOT_AVAILABLE') {
        return res.status(409).json({
          error: 'Slot nicht verfügbar. Bitte prüfen, ob Slots für das Event generiert wurden oder ob der Slot bereits vergeben ist.',
          details: assignment.details,
        });
      }
      if (assignment.code === 'SLOT_ALREADY_BOOKED') {
        return res.status(409).json({ error: 'Slot bereits vergeben' });
      }
      if (assignment.code === 'REQUEST_NOT_PENDING_ANYMORE') {
        return res.status(409).json({ error: 'Anfrage ist nicht mehr offen' });
      }
      return res.status(409).json({ error: 'Anfrage konnte nicht angenommen werden' });
    }

    return res.json({
      success: true,
      request: mapBookingRequestRow(assignment.updatedReq),
      slot: mapSlotRow(assignment.updatedSlot),
    });
  } catch (error) {
    console.error('Error accepting booking request:', error);
    return res.status(500).json({ error: 'Failed to accept request' });
  }
});

/**
 * PUT /api/teacher/requests/:id/decline
 */
router.put('/requests/:id/decline', requireAuth, requireTeacher, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  try {
    const teacherId = req.user.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID not found in token' });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('booking_requests')
      .update({ status: 'declined', updated_at: now })
      .eq('id', requestId)
      .eq('teacher_id', teacherId)
      .eq('status', 'requested')
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Request not found or not pending' });
      }
      throw error;
    }

    return res.json({ success: true, request: mapBookingRequestRow(data) });
  } catch (error) {
    console.error('Error declining booking request:', error);
    return res.status(500).json({ error: 'Failed to decline request' });
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
    // Feature intentionally disabled (historic reasons). Keep endpoint present but unavailable.
    return res.status(404).json({ error: 'Not found' });

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
