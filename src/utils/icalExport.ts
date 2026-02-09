import type { TimeSlot as ApiSlot, TimeSlot as ApiBooking, Settings as ApiSettings } from '../types';

/**
 * Generiert eine iCal (.ics) Datei für Kalender-Export
 */

function escapeICalText(value: unknown): string {
  const raw = String(value ?? '').trim();
  // RFC 5545 text escaping: backslash, semicolon, comma, and newlines
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function sanitizeFileName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '')
    .slice(0, 120) || 'export';
}

function foldICalLine(line: string): string {
  // Fold lines at 75 octets with CRLF + space continuation (RFC 5545)
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;

  let out = '';
  let chunk = '';
  let chunkBytes = 0;

  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (chunkBytes + b > 75) {
      out += (out ? '\r\n ' : '') + chunk;
      chunk = ch;
      chunkBytes = b;
    } else {
      chunk += ch;
      chunkBytes += b;
    }
  }

  if (chunk) out += (out ? '\r\n ' : '') + chunk;
  return out;
}

function buildICalContent(lines: string[]): string {
  const folded = lines
    .flatMap((l) => String(l).split(/\r\n|\r|\n/))
    .map((l) => foldICalLine(l));
  return `${folded.join('\r\n')}\r\n`;
}

function parseDateToLocal(dateStr: string): Date {
  const raw = String(dateStr).trim();
  // Accept ISO (YYYY-MM-DD) or German (DD.MM.YYYY)
  let d: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    d = new Date(`${raw}T00:00:00`);
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split('.');
    d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  } else {
    // Try native parsing last (may be unreliable)
    d = new Date(raw);
  }
  if (!d || Number.isNaN(d.getTime())) throw new Error('Invalid date value');
  return d;
}

function normalizeTimeRange(timeStr: string): [number, number, number, number] {
  const cleaned = String(timeStr).trim();
  const parts = cleaned.split(/\s*[-–—]\s*/);
  if (!parts[0] || !parts[1]) throw new Error('Invalid time range for ICS');

  const extract = (part: string): [number, number] => {
    const m = String(part).match(/(\d{1,2}):(\d{2})/);
    if (!m) throw new Error('Invalid time value for ICS');
    return [Number(m[1]), Number(m[2])];
  };

  const [sH, sM] = extract(parts[0]);
  const [eH, eM] = extract(parts[1]);
  if ([sH, sM, eH, eM].some((n) => Number.isNaN(n))) throw new Error('NaN time values');
  return [sH, sM, eH, eM];
}

function formatICalDateLocal(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) throw new Error('Invalid date/time for ICS');
  const date = parseDateToLocal(dateStr);
  const [sH, sM] = normalizeTimeRange(timeStr);
  date.setHours(sH, sM, 0, 0);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getEndTimeLocal(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) throw new Error('Invalid date/time for ICS');
  const date = parseDateToLocal(dateStr);
  const [, , eH, eM] = normalizeTimeRange(timeStr);
  date.setHours(eH, eM, 0, 0);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getCurrentTimestamp(): string {
  // DTSTAMP should be UTC
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function buildVisitorDetails(slot: ApiSlot | ApiBooking): { titleTarget: string; description: string } {
  const safeClassName = slot.className?.trim() || 'nicht angegeben';

  if (slot.visitorType === 'company') {
    const safeCompanyName = slot.companyName?.trim() || 'nicht angegeben';
    const safeRepresentativeName = slot.representativeName?.trim() || 'nicht angegeben';
    const safeTraineeName = slot.traineeName?.trim() || slot.studentName?.trim() || 'nicht angegeben';
    return {
      titleTarget: safeCompanyName,
      description: `Ausbildungsbetrieb: ${safeCompanyName}\nVertreter*in: ${safeRepresentativeName}\nAzubi: ${safeTraineeName}\nKlasse: ${safeClassName}`,
    };
  }

  const safeParentName = slot.parentName?.trim() || 'nicht angegeben';
  const safeStudentName = slot.studentName?.trim() || 'nicht angegeben';
  return {
    titleTarget: safeParentName,
    description: `Schüler*in: ${safeStudentName}\nKlasse: ${safeClassName}\nErziehungsberechtigte: ${safeParentName}`,
  };
}

function buildLocation(teacherRoom?: string): string {
  const base = 'BKSB';
  const room = teacherRoom?.trim();
  if (!room) return base;
  return `${base}, Raum ${room}`;
}

/**
 * Export einzelner gebuchter Slot als iCal für User
 */
export function exportSlotToICal(
  slot: ApiSlot,
  teacherName: string,
  settings?: ApiSettings
): void {
  let startDate: string;
  let endDate: string;
  try {
    startDate = formatICalDateLocal(slot.date, slot.time);
    endDate = getEndTimeLocal(slot.date, slot.time);
  } catch (e) {
    console.error('ICS export error (slot):', e);
    alert('Export fehlgeschlagen: Ungültiges Datum/Zeit im Termin. Bitte prüfen Sie die Terminzeit.');
    return;
  }
  const timestamp = getCurrentTimestamp();
  const eventName = settings?.event_name || 'BKSB Eltern- und Ausbildersprechtag';
  const visitor = buildVisitorDetails(slot);

  const icalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BKSB Eltern- und Ausbildersprechtag//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-TIMEZONE:Europe/Berlin',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'X-LIC-LOCATION:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:slot-${slot.id}-${startDate}@bksb-elternsprechtag.de`,
    `DTSTAMP:${timestamp}`,
    `DTSTART;TZID=Europe/Berlin:${startDate}`,
    `DTEND;TZID=Europe/Berlin:${endDate}`,
    `SUMMARY:${escapeICalText(`${eventName} - ${teacherName}`)}`,
    `DESCRIPTION:${escapeICalText(`Gespräch mit ${teacherName}\n${visitor.description}`)}`,
    `LOCATION:${escapeICalText('BKSB')}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICalText('Erinnerung: Eltern- und Ausbildersprechtag in 15 Minuten')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icalContent = buildICalContent(icalLines);
  downloadICalFile(icalContent, `${sanitizeFileName(`Eltern-und-Ausbildersprechtag-${teacherName}-${slot.time}`)}.ics`);
}

/**
 * Export aller Buchungen für Admin als iCal
 */
export function exportBookingsToICal(
  bookings: ApiBooking[],
  settings?: ApiSettings,
  opts?: { teacherRoomById?: Record<number, string | undefined>; defaultRoom?: string }
): void {
  const timestamp = getCurrentTimestamp();
  const eventName = settings?.event_name || 'BKSB Eltern- und Ausbildersprechtag';
  
  const events = bookings.map(booking => {
    try {
      const startDate = formatICalDateLocal(booking.date, booking.time);
      const endDate = getEndTimeLocal(booking.date, booking.time);
      const safeTeacherName = booking.teacherName?.trim() || 'nicht angegeben';
      const visitor = buildVisitorDetails(booking);
      const roomFromMap = opts?.teacherRoomById && booking.teacherId ? opts.teacherRoomById[booking.teacherId] : undefined;
      const room = roomFromMap ?? opts?.defaultRoom;
      return [
        'BEGIN:VEVENT',
        `UID:booking-${booking.id}-${startDate}@bksb-elternsprechtag.de`,
        `DTSTAMP:${timestamp}`,
        `DTSTART;TZID=Europe/Berlin:${startDate}`,
        `DTEND;TZID=Europe/Berlin:${endDate}`,
        `SUMMARY:${escapeICalText(`${eventName} – ${safeTeacherName}`)}`,
        `DESCRIPTION:${escapeICalText(visitor.description)}`,
        `LOCATION:${escapeICalText(buildLocation(room))}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT'
      ].join('\r\n');
    } catch (e) {
      console.warn('Überspringe ungültigen Termin beim Export:', booking, e);
      return null;
    }
  }).filter(Boolean).join('\r\n');
  
  if (!events) {
    alert('Export fehlgeschlagen: Keine gültigen Termine gefunden. Bitte prüfen Sie die Daten.');
    return;
  }

  const icalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BKSB Eltern- und Ausbildersprechtag//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-TIMEZONE:Europe/Berlin',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'X-LIC-LOCATION:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    `X-WR-CALNAME:${escapeICalText(`${eventName} - Alle Buchungen`)}`,
    `X-WR-CALDESC:${escapeICalText(`Übersicht aller Termine für ${eventName}`)}`,
    events,
    'END:VCALENDAR',
  ];

  const dateStr = settings?.event_date ? new Date(settings.event_date).toISOString().split('T')[0] : 'termine';
  const icalContent = buildICalContent(icalLines);
  downloadICalFile(icalContent, `${sanitizeFileName(`Eltern-und-Ausbildersprechtag-Alle-Buchungen-${dateStr}`)}.ics`);
}

/**
 * Export Slots einer Lehrkraft für Admin als iCal
 */
export function exportTeacherSlotsToICal(
  slots: ApiSlot[],
  teacherName: string,
  teacherRoom?: string,
  settings?: ApiSettings
): void {
  const timestamp = getCurrentTimestamp();
  const eventName = settings?.event_name || 'BKSB Eltern- und Ausbildersprechtag';
  const bookedSlots = slots.filter(s => s.booked);
  
  if (bookedSlots.length === 0) {
    alert('Keine gebuchten Termine für diese Lehrkraft vorhanden.');
    return;
  }
  
  const events = bookedSlots.map(slot => {
    try {
      const startDate = formatICalDateLocal(slot.date, slot.time);
      const endDate = getEndTimeLocal(slot.date, slot.time);
      const visitor = buildVisitorDetails(slot);
      return [
        'BEGIN:VEVENT',
        `UID:teacher-slot-${slot.id}-${startDate}@bksb-elternsprechtag.de`,
        `DTSTAMP:${timestamp}`,
        `DTSTART;TZID=Europe/Berlin:${startDate}`,
        `DTEND;TZID=Europe/Berlin:${endDate}`,
        `SUMMARY:${escapeICalText(`Termin: ${visitor.titleTarget}`.trim())}`,
        `DESCRIPTION:${escapeICalText(visitor.description)}`,
        `LOCATION:${escapeICalText(buildLocation(teacherRoom))}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT'
      ].join('\r\n');
    } catch (e) {
      console.warn('Überspringe ungültigen Slot beim Export:', slot, e);
      return null;
    }
  }).filter(Boolean).join('\r\n');
  
  if (!events) {
    alert('Export fehlgeschlagen: Keine gültigen Slots gefunden. Bitte prüfen Sie die Daten.');
    return;
  }

  const icalLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BKSB Eltern- und Ausbildersprechtag//DE',
    'CALSCALE:GREGORIAN',
    'X-WR-TIMEZONE:Europe/Berlin',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'X-LIC-LOCATION:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    `X-WR-CALNAME:${escapeICalText(`${eventName} - ${teacherName}`)}`,
    `X-WR-CALDESC:${escapeICalText(`Termine für ${teacherName}`)}`,
    events,
    'END:VCALENDAR',
  ];

  const icalContent = buildICalContent(icalLines);
  downloadICalFile(icalContent, `${sanitizeFileName(`Eltern-und-Ausbildersprechtag-${teacherName}`)}.ics`);
}

/**
 * Helper: Download iCal file
 */
function downloadICalFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });

  // Mobile-friendly: use Web Share API (share .ics to Calendar apps) if available.
  // Fallback: classic download via object URL.
  const tryShare = async () => {
    try {
      const nav = navigator as Navigator;
      if (typeof nav.share !== 'function') return false;
      const file = new File([blob], filename, { type: 'text/calendar;charset=utf-8' });
      if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return false;
      await nav.share({ files: [file], title: filename });
      return true;
    } catch {
      return false;
    }
  };

  void (async () => {
    const shared = await tryShare();
    if (shared) return;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  })();
}
