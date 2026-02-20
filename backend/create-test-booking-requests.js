#!/usr/bin/env node

import crypto from 'crypto';
import { supabase } from './config/supabase.js';

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function formatDateDE(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

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

async function resolveTeacherIdByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('teacher_id')
    .eq('username', username)
    .limit(1)
    .single();
  if (error) throw error;
  return data?.teacher_id ? Number(data.teacher_id) : undefined;
}

async function resolveActiveEvent() {
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
  return activeEvents && activeEvents.length ? activeEvents[0] : null;
}

function parseSlotRangeStartMinutes(range) {
  const m = String(range || '').trim().match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function toHalfHourWindow(startMinutes) {
  if (!Number.isFinite(startMinutes)) return null;
  const windowStart = Math.floor(startMinutes / 30) * 30;
  const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return `${fmt(windowStart)} - ${fmt(windowStart + 30)}`;
}

async function resolveSeedContextFromSlots(teacherId) {
  const { data: firstFreeSlots, error: firstErr } = await supabase
    .from('slots')
    .select('id, date, time, event_id')
    .eq('teacher_id', teacherId)
    .eq('booked', false)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1);
  if (firstErr) throw firstErr;

  const first = firstFreeSlots && firstFreeSlots.length ? firstFreeSlots[0] : null;
  if (!first?.date) return { date: null, windows: [], slotEventId: null };

  const { data: sameDay, error: dayErr } = await supabase
    .from('slots')
    .select('time, event_id')
    .eq('teacher_id', teacherId)
    .eq('booked', false)
    .eq('date', first.date)
    .order('time', { ascending: true })
    .limit(500);
  if (dayErr) throw dayErr;

  const windows = [];
  for (const row of sameDay || []) {
    const startMins = parseSlotRangeStartMinutes(row.time);
    const w = toHalfHourWindow(startMins);
    if (w && !windows.includes(w)) windows.push(w);
  }

  return {
    date: first.date,
    windows,
    slotEventId: first.event_id ?? null,
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildDemoRows({ eventId, teacherId, eventDate, requestedTimes, nowIso, seedTag }) {
  const times = requestedTimes.slice(0, 4);
  while (times.length < 4) {
    times.push(requestedTimes[times.length % requestedTimes.length] || '16:00 - 16:30');
  }

  const rows = [];

  // 2x Eltern, 2x Betrieb
  rows.push({
    event_id: eventId,
    teacher_id: teacherId,
    requested_time: times[0],
    date: eventDate,
    status: 'requested',
    visitor_type: 'parent',
    parent_name: 'Max Mustermann',
    company_name: null,
    student_name: 'Erika Mustermann',
    trainee_name: null,
    representative_name: null,
    class_name: 'BG 12',
    email: 'demo.eltern1@beispiel.de',
    message: `Demo-Anfrage (${seedTag}): Kurzes Gespräch zur Leistungsentwicklung.`,
    verification_token_hash: sha256Hex(crypto.randomBytes(32).toString('hex')),
    verification_sent_at: nowIso,
    verified_at: nowIso,
    confirmation_sent_at: null,
    assigned_slot_id: null,
    updated_at: nowIso,
  });

  rows.push({
    event_id: eventId,
    teacher_id: teacherId,
    requested_time: times[1],
    date: eventDate,
    status: 'requested',
    visitor_type: 'parent',
    parent_name: 'Sabine Beispiel',
    company_name: null,
    student_name: 'Tim Beispiel',
    trainee_name: null,
    representative_name: null,
    class_name: 'WG 11',
    email: 'demo.eltern2@beispiel.de',
    message: `Demo-Anfrage (${seedTag}): Fragen zu Fehlzeiten und Nachholmöglichkeiten.`,
    verification_token_hash: sha256Hex(crypto.randomBytes(32).toString('hex')),
    verification_sent_at: nowIso,
    verified_at: nowIso,
    confirmation_sent_at: null,
    assigned_slot_id: null,
    updated_at: nowIso,
  });

  rows.push({
    event_id: eventId,
    teacher_id: teacherId,
    requested_time: times[2],
    date: eventDate,
    status: 'requested',
    visitor_type: 'company',
    parent_name: null,
    company_name: 'Muster GmbH',
    student_name: null,
    trainee_name: 'Lena Azubi',
    representative_name: 'Karl Ansprechpartner',
    class_name: 'BK 1',
    email: 'demo.betrieb1@beispiel.de',
    message: `Demo-Anfrage (${seedTag}): Abstimmung Ausbildungsstand / Einsatzplanung.`,
    verification_token_hash: sha256Hex(crypto.randomBytes(32).toString('hex')),
    verification_sent_at: nowIso,
    verified_at: nowIso,
    confirmation_sent_at: null,
    assigned_slot_id: null,
    updated_at: nowIso,
  });

  rows.push({
    event_id: eventId,
    teacher_id: teacherId,
    requested_time: times[3],
    date: eventDate,
    status: 'requested',
    visitor_type: 'company',
    parent_name: null,
    company_name: 'Beispiel AG',
    student_name: null,
    trainee_name: 'Jonas Azubi',
    representative_name: 'Nina HR',
    class_name: 'FS 2',
    email: 'demo.betrieb2@beispiel.de',
    message: `Demo-Anfrage (${seedTag}): Rückmeldung zum Praktikum / Ausbildungsbetrieb.`,
    verification_token_hash: sha256Hex(crypto.randomBytes(32).toString('hex')),
    verification_sent_at: nowIso,
    verified_at: nowIso,
    confirmation_sent_at: null,
    assigned_slot_id: null,
    updated_at: nowIso,
  });

  return rows;
}

async function main() {
  const username = getArgValue('--teacher-username') || 'marc.huhn';
  const teacherId = await resolveTeacherIdByUsername(username);
  if (!teacherId || Number.isNaN(teacherId)) {
    console.error(`Could not resolve teacher_id for username "${username}".`);
    console.error('Make sure the user exists and has teacher_id set in table "users".');
    process.exit(1);
  }

  const activeEvent = await resolveActiveEvent();

  const { data: teacherRow, error: teacherErr } = await supabase
    .from('teachers')
    .select('id, system, name')
    .eq('id', teacherId)
    .single();
  if (teacherErr) throw teacherErr;

  const nowIso = new Date().toISOString();
  const slotContext = await resolveSeedContextFromSlots(teacherId);
  const fallbackDate = formatDateDE(activeEvent?.starts_at || nowIso) || '01.01.1970';
  const seedDate = slotContext.date || fallbackDate;

  const requestedTimesFromSlots = slotContext.windows;
  const requestedTimesForSystem = getRequestedTimeWindowsForSystem(teacherRow?.system || 'dual');
  const requestedTimes = requestedTimesFromSlots.length ? requestedTimesFromSlots : requestedTimesForSystem;

  const eventId = activeEvent?.id ?? slotContext.slotEventId ?? null;
  const seedTag = nowIso.slice(0, 19);

  const rows = buildDemoRows({
    eventId,
    teacherId,
    eventDate: seedDate,
    requestedTimes,
    nowIso,
    seedTag,
  });

  const { data: created, error: insErr } = await supabase
    .from('booking_requests')
    .insert(rows)
    .select('id, event_id, teacher_id, date, requested_time, visitor_type, email, verified_at, created_at');
  if (insErr) throw insErr;

  console.log('✅ Seeded demo booking requests');
  console.log(`- teacher:   ${teacherRow?.name || username} (teacher_id=${teacherId}, system=${teacherRow?.system || 'dual'})`);
  console.log(`- event_id:  ${eventId ?? 'null'}`);
  console.log(`- date:      ${seedDate}`);
  console.log(`- inserted:  ${created?.length || 0}`);
  console.log(`- ids:       ${(created || []).map((r) => r.id).join(', ')}`);
  console.log('These should appear under Lehrkraft → Anfragen einsehen.');
}

main().catch((e) => {
  console.error('Failed to seed booking requests:', e?.message || e);
  process.exit(1);
});
