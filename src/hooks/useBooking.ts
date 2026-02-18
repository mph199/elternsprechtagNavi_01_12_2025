import { useState, useCallback, useEffect } from 'react';
import type { TimeSlot, BookingFormData, Teacher } from '../types';
import api from '../services/api';

type CreateBookingRequestResponse = {
  success?: boolean;
  message?: string;
};

function buildHalfHourWindows(startHour: number, endHour: number) {
  const windows: string[] = [];
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toMins = (h: number, m: number) => h * 60 + m;
  const fmt = (mins: number) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  const start = toMins(startHour, 0);
  const end = toMins(endHour, 0);
  for (let m = start; m + 30 <= end; m += 30) {
    windows.push(`${fmt(m)} - ${fmt(m + 30)}`);
  }
  return windows;
}

function getRequestedTimeWindowsForSystem(system: Teacher['system'] | undefined) {
  return system === 'vollzeit' ? buildHalfHourWindows(17, 19) : buildHalfHourWindows(16, 18);
}

function formatDateDE(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
}

export const useBooking = (
  selectedTeacherId: number | null,
  eventId?: number | null,
  eventStartsAt?: string | null,
  selectedTeacherSystem?: Teacher['system'],
) => {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [bookingNoticeOpen, setBookingNoticeOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Build fixed time windows when teacher is selected and event is active
  useEffect(() => {
    if (!selectedTeacherId || eventId === null) {
      setSlots([]);
      setSelectedSlotId(null);
      return;
    }
    setLoading(false);
    setError('');

    const date = formatDateDE(eventStartsAt);
    const times = getRequestedTimeWindowsForSystem(selectedTeacherSystem);
    const fixedSlots: TimeSlot[] = times.map((time, idx) => ({
      id: idx + 1,
      teacherId: selectedTeacherId,
      time,
      date,
      booked: false,
    }));
    setSlots(fixedSlots);
  }, [selectedTeacherId, eventId, eventStartsAt, selectedTeacherSystem]);

  const handleSelectSlot = useCallback((slotId: number) => {
    setSelectedSlotId(slotId);
    setMessage('');
    setBookingNoticeOpen(false);
  }, []);

  const handleBooking = useCallback(async (formData: BookingFormData) => {
    if (!selectedSlotId) {
      setMessage('Bitte wählen Sie einen Zeitslot aus.');
      return;
    }

    if (!selectedTeacherId) {
      setMessage('Bitte wählen Sie zuerst eine Lehrkraft aus.');
      return;
    }

    if (eventId === null) {
      setMessage('Buchungen sind aktuell nicht freigeschaltet.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const selectedSlot = slots.find((s) => s.id === selectedSlotId);
      const requestedTime = selectedSlot?.time;
      if (!requestedTime) {
        setMessage('Bitte wählen Sie einen Zeitslot aus.');
        return;
      }

      const response = (await api.createBookingRequest(
        selectedTeacherId,
        requestedTime,
        formData
      )) as CreateBookingRequestResponse | null;

      if (response?.success) {
        setMessage('Danke für Ihre Buchungsanfrage!');
        setBookingNoticeOpen(true);
        setSelectedSlotId(null);
      } else {
        setMessage(response?.message || 'Buchung fehlgeschlagen');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Fehler beim Buchen';
      setMessage(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [selectedSlotId, selectedTeacherId, eventId, slots]);

  const resetSelection = useCallback(() => {
    setSelectedSlotId(null);
    setMessage('');
    setBookingNoticeOpen(false);
  }, []);

  return {
    slots,
    selectedSlotId,
    message,
    bookingNoticeOpen,
    loading,
    error,
    handleSelectSlot,
    handleBooking,
    resetSelection,
  };
};
