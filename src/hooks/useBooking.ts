import { useState, useCallback, useEffect } from 'react';
import type { TimeSlot, BookingFormData } from '../types';
import { api } from '../services/api';

export const useBooking = (selectedTeacherId: number | null) => {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastBookedSlot, setLastBookedSlot] = useState<TimeSlot | null>(null);

  // Lade Slots wenn Lehrkraft ausgewählt wird
  useEffect(() => {
    if (!selectedTeacherId) {
      setSlots([]);
      return;
    }

    const loadSlots = async () => {
      setLoading(true);
      setError('');
      try {
        const fetchedSlots = await api.getSlots(selectedTeacherId);
        setSlots(fetchedSlots);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden der Termine');
        setSlots([]);
      } finally {
        setLoading(false);
      }
    };

    loadSlots();
  }, [selectedTeacherId]);

  const handleSelectSlot = useCallback((slotId: number) => {
    setSelectedSlotId(slotId);
    setMessage('');
  }, []);

  const handleBooking = useCallback(async (formData: BookingFormData) => {
    if (!selectedSlotId) {
      setMessage('Bitte wählen Sie einen Zeitslot aus.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.createBooking(selectedSlotId, formData);
      
      if (response.success && response.updatedSlot) {
        // Aktualisiere lokalen State
        setSlots((prevSlots) =>
          prevSlots.map((slot) =>
            slot.id === selectedSlotId ? response.updatedSlot! : slot
          )
        );
        setLastBookedSlot(response.updatedSlot);
        setMessage('Buchung erfolgreich!');
        setSelectedSlotId(null);
      } else {
        setMessage(response.message || 'Buchung fehlgeschlagen');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Fehler beim Buchen';
      setMessage(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [selectedSlotId]);

  const resetSelection = useCallback(() => {
    setSelectedSlotId(null);
    setMessage('');
  }, []);

  return {
    slots,
    selectedSlotId,
    message,
    loading,
    error,
    handleSelectSlot,
    handleBooking,
    resetSelection,
  };
};
