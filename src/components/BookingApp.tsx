import { useState, useMemo, useEffect } from 'react';
import { SlotList } from './SlotList';
import { BookingForm } from './BookingForm';
import { TeacherCombobox } from './TeacherCombobox';
import { useBooking } from '../hooks/useBooking';
import type { Teacher } from '../types';
import { teacherDisplayNameAccusative } from '../utils/teacherDisplayName';
import api from '../services/api';
import './BookingApp.css';

type ActiveEvent = {
  id: number;
  name: string;
  school_year: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'closed';
  booking_opens_at?: string | null;
  booking_closes_at?: string | null;
} | null;

type ActiveEventResponse = {
  event: Exclude<ActiveEvent, null> | null;
};

export const BookingApp = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState<boolean>(true);
  const [teachersError, setTeachersError] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent>(null);
  const [eventLoading, setEventLoading] = useState<boolean>(true);
  const [eventError, setEventError] = useState<string>('');

  const formattedEventHeader = useMemo(() => {
    if (!activeEvent) return '';

    const starts = new Date(activeEvent.starts_at);
    const ends = new Date(activeEvent.ends_at);

    const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(starts);
    const date = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(starts);
    const startTime = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(starts);
    const endTime = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(ends);

    return `${weekday}, ${date} | ${startTime}–${endTime} Uhr`;
  }, [activeEvent]);
  
  
  const {
    slots,
    selectedSlotId,
    message,
    bookingNoticeOpen,
    loading: slotsLoading,
    error: slotsError,
    handleSelectSlot,
    handleBooking,
    resetSelection,
  } = useBooking(selectedTeacherId, activeEvent?.id ?? null);

  // Lade Lehrkräfte beim Mount
  useEffect(() => {
    const loadActiveEvent = async () => {
      setEventLoading(true);
      setEventError('');
      try {
        const res = await api.events.getActive();
        setActiveEvent((res as ActiveEventResponse).event ?? null);
      } catch (e) {
        setEventError(e instanceof Error ? e.message : 'Fehler beim Laden des Eltern- und Ausbildersprechtags');
        setActiveEvent(null);
      } finally {
        setEventLoading(false);
      }
    };

    const loadTeachers = async () => {
      try {
        const fetchedTeachers = await api.getTeachers();
        setTeachers(fetchedTeachers);
      } catch (err) {
        setTeachersError(err instanceof Error ? err.message : 'Fehler beim Laden der Lehrkräfte');
      } finally {
        setTeachersLoading(false);
      }
    };

    loadActiveEvent();
    loadTeachers();
  }, []);

  const handleTeacherSelect = (teacherId: number) => {
    setSelectedTeacherId(teacherId);
    resetSelection();
  };

  const handleClearTeacher = () => {
    setSelectedTeacherId(null);
    resetSelection();
  };

  const selectedTeacher = useMemo(() => {
    if (!selectedTeacherId) return null;
    return teachers.find((t) => t.id === selectedTeacherId) ?? null;
  }, [teachers, selectedTeacherId]);

  const selectedTeacherAccusativeName = useMemo(() => {
    return selectedTeacher ? teacherDisplayNameAccusative(selectedTeacher) : null;
  }, [selectedTeacher]);

  return (
    <div className="booking-app">
      {bookingNoticeOpen && (
        <div className="booking-notice-overlay" role="dialog" aria-modal="true" aria-label="Hinweis zur E-Mail-Bestätigung">
          <div className="booking-notice">
            <h3>Fast fertig</h3>
            <p>
              Danke für Ihre Buchungsanfrage!
            </p>
            <p>
              <span className="booking-notice-important">Wichtig:</span>{' '}
              Die Lehrkraft kann den Termin erst bestätigen, nachdem Sie Ihre E-Mail-Adresse bestätigt haben.
              Bitte prüfen Sie Ihr Postfach (ggf. Spam) und klicken Sie auf den Bestätigungslink.
            </p>
            <button type="button" className="btn btn-primary" onClick={resetSelection}>
              Verstanden
            </button>
          </div>
        </div>
      )}

      <section className="welcomeWindow" aria-label="Willkommen">
        <div className="welcomeWindow__inner">
          <div className="welcomeWindow__grid">
            <div className="welcomeWindow__main">
              <div className="welcomeWindow__headlineRow">
                <h1 className="welcomeWindow__title">Herzlich willkommen!</h1>
              </div>

              <p className="welcomeWindow__text">
                Über dieses Portal können Sie Termine für den Eltern- und Ausbildersprechtag am BKSB bequem online anfragen.
              </p>

              <p className="welcomeWindow__text">
                Wählen Sie die gewünschte Lehrkraft aus, klicken Sie auf einen freien Termin und senden Sie Ihre Anfrage ab.
              </p>

              <div className="welcomeWindow__eventLine" aria-label="Termin">
                {formattedEventHeader ? formattedEventHeader : 'Termine folgen'}
              </div>

              {(eventLoading || eventError || !activeEvent) && (
                <div className={`welcomeWindow__notice${eventError ? ' is-error' : ''}`} role="status">
                  {eventLoading ? 'Lade Eltern- und Ausbildersprechtag…' : eventError ? eventError : 'Buchungen sind aktuell noch nicht freigeschaltet.'}
                </div>
              )}
            </div>

            <aside className="welcomeWindow__side" aria-label="Kurzanleitung">
              <h2 className="welcomeWindow__sideTitle">In drei Schritten zum Termin:</h2>
              <ol className="welcomeWindow__steps">
                <li>Lehrkraft auswählen</li>
                <li>Freien Slot anklicken</li>
                <li>Daten eingeben und Anfrage senden</li>
              </ol>
            </aside>
          </div>
        </div>
      </section>

      <div className="app-content">
        <aside className="sidebar">
          {teachersLoading && <p className="loading-message">Lade Lehrkräfte...</p>}
          {teachersError && <p className="error-message">{teachersError}</p>}
          {!teachersLoading && !teachersError && (
            <TeacherCombobox
              teachers={teachers}
              selectedTeacherId={selectedTeacherId}
              disabled={teachersLoading}
              onSelectTeacher={handleTeacherSelect}
              onClearSelection={handleClearTeacher}
            />
          )}
        </aside>

        <main className="main-content">
          {slotsLoading && <p className="loading-message">Lade Termine...</p>}
          {slotsError && <p className="error-message">{slotsError}</p>}
          {!slotsLoading && !slotsError && (
            <SlotList
              slots={slots}
              selectedSlotId={selectedSlotId}
              selectedTeacherId={selectedTeacherId}
              selectedTeacherName={selectedTeacherAccusativeName}
              eventId={activeEvent?.id ?? null}
              onSelectSlot={handleSelectSlot}
            />
          )}

          <BookingForm
            key={selectedTeacherId ?? 'no-teacher'}
            selectedSlotId={selectedSlotId}
            onSubmit={handleBooking}
            onCancel={resetSelection}
            message={message}
          />
        </main>
      </div>
    </div>
  );
};
