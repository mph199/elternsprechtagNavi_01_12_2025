import { useState, useMemo, useEffect } from 'react';
import { TeacherList } from './TeacherList';
import { SlotList } from './SlotList';
import { BookingForm } from './BookingForm';
import { useBooking } from '../hooks/useBooking';
import type { Teacher } from '../types';
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
  const [teacherSearch, setTeacherSearch] = useState<string>('');
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

    return `${weekday}, ${date} | ${startTime} - ${endTime} Uhr`;
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
        setEventError(e instanceof Error ? e.message : 'Fehler beim Laden des Elternsprechtags');
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

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const searchLower = teacherSearch.trim().toLowerCase();
      const matchesSearch = searchLower
        ? t.name.toLowerCase().includes(searchLower)
        : true;
      return matchesSearch;
    });
  }, [teachers, teacherSearch]);

  const handleTeacherSelect = (teacherId: number) => {
    setSelectedTeacherId(teacherId);
    resetSelection();
  };

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
      <header className="app-header">
        <div className="header-inner">
          <div className="header-content">
            <div className="header-text">
              <div className="brand">
                <h1 className="brand-title">BKSB Navi</h1>
                <span className="subpage-badge">Elternsprechtag</span>
              </div>
              {formattedEventHeader ? (
                <p className="header-date">{formattedEventHeader}</p>
              ) : (
                <p className="header-date">Elternsprechtag | Termine folgen</p>
              )}
              <p>
                Willkommen im Buchungssystem des BKSB für Termine am Eltern- und
                Ausbildersprechtag.
              </p>
            </div>
            <a href="/login" className="admin-button">
              Login
            </a>
          </div>
        </div>
      </header>

      {(eventLoading || eventError || !activeEvent) && (
        <div className={`event-banner${eventError ? ' event-banner-error' : ''}`}>
          {eventLoading ? (
            <p>Lade Elternsprechtag…</p>
          ) : eventError ? (
            <p>{eventError}</p>
          ) : (
            <p>Buchungen sind aktuell noch nicht freigeschaltet.</p>
          )}
        </div>
      )}

      <div className="app-content">
        <aside className="sidebar">
          <form
            className="teacher-search"
            aria-label="Lehrkraft suchen"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="teacher-search-group">
              <label htmlFor="teacherSearch">Lehrkraft</label>
              <input
                id="teacherSearch"
                type="text"
                placeholder="Name suchen..."
                value={teacherSearch}
                onChange={(e) => {
                  setTeacherSearch(e.target.value);
                  setSelectedTeacherId(null);
                }}
                aria-label="Lehrkraft nach Namen filtern"
                disabled={teachersLoading}
              />
              {teacherSearch && (
                <button
                  type="button"
                  className="btn btn-secondary btn-small clear-btn"
                  onClick={() => {
                    setTeacherSearch('');
                    setSelectedTeacherId(null);
                  }}
                  aria-label="Suche zurücksetzen"
                >
                  Löschen
                </button>
              )}
            </div>
          </form>
          {teachersLoading && <p className="loading-message">Lade Lehrkräfte...</p>}
          {teachersError && <p className="error-message">{teachersError}</p>}
          {!teachersLoading && !teachersError && (
            <TeacherList
              teachers={filteredTeachers}
              selectedTeacherId={selectedTeacherId}
              onSelectTeacher={handleTeacherSelect}
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
              onSelectSlot={handleSelectSlot}
            />
          )}

          <BookingForm
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
