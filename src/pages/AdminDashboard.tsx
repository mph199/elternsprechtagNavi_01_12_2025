import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot as ApiBooking } from '../types';
import { exportBookingsToICal } from '../utils/icalExport';
import './AdminDashboard.css';

type ActiveEvent = {
  id: number;
  name: string;
  school_year: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'closed';
  booking_opens_at?: string | null;
  booking_closes_at?: string | null;
};

type EventStats = {
  eventId: number;
  totalSlots: number;
  availableSlots: number;
  bookedSlots: number;
  reservedSlots: number;
  confirmedSlots: number;
};

export function AdminDashboard() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [activeEventStats, setActiveEventStats] = useState<EventStats | null>(null);
  const [activeEventStatsError, setActiveEventStatsError] = useState<string>('');
  const { user, setActiveView } = useAuth();

  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  useEffect(() => {
    if (canSwitchView) setActiveView('admin');
  }, [canSwitchView, setActiveView]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const statusLabel: Record<ActiveEvent['status'], string> = {
    draft: 'Entwurf',
    published: 'Veröffentlicht',
    closed: 'Geschlossen',
  };

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // Use appropriate endpoint per role
      const data = user?.role === 'teacher'
        ? await api.teacher.getBookings()
        : await api.admin.getBookings();
      setBookings(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Buchungen');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadActiveEvent = useCallback(async () => {
    try {
      const res = await api.events.getActive();
      const parsed = res as unknown as { event?: ActiveEvent | null };
      setActiveEvent(parsed?.event || null);
    } catch {
      // Non-blocking: keep UI usable even if event endpoint fails
      setActiveEvent(null);
    }
  }, []);

  const loadActiveEventStats = useCallback(async (eventId: number) => {
    try {
      setActiveEventStatsError('');
      const res = await api.admin.getEventStats(eventId);
      setActiveEventStats(res as EventStats);
    } catch (e) {
      setActiveEventStats(null);
      setActiveEventStatsError(e instanceof Error ? e.message : 'Fehler beim Laden der Slot-Statistik');
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    loadActiveEvent();
  }, [loadActiveEvent]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      setActiveEventStats(null);
      setActiveEventStatsError('');
      return;
    }
    if (!activeEvent?.id) {
      setActiveEventStats(null);
      setActiveEventStatsError('');
      return;
    }
    loadActiveEventStats(activeEvent.id);
  }, [activeEvent?.id, loadActiveEventStats, user?.role]);

  const handleCancelBooking = async (slotId: number) => {
    if (!confirm('Möchten Sie diese Buchung wirklich stornieren?')) {
      return;
    }

    try {
      await api.admin.cancelBooking(slotId);
      await loadBookings(); // Reload bookings after cancellation
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Stornieren');
    }
  };

  const handleExportAll = async () => {
    if (!bookings.length) return;

    // Add rooms to LOCATION when possible (Admin has access to teachers with rooms).
    if (user?.role === 'admin') {
      try {
        const teachers = await api.admin.getTeachers();
        const teacherRoomById: Record<number, string | undefined> = {};
        for (const t of teachers || []) {
          if (t?.id) teacherRoomById[Number(t.id)] = t.room;
        }
        exportBookingsToICal(bookings, undefined, { teacherRoomById });
        return;
      } catch (e) {
        console.warn('ICS export: could not load teachers for room mapping', e);
        // Fallback: export without rooms
      }
    }

    exportBookingsToICal(bookings);
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard admin-dashboard--admin">
      <main className="admin-main">
        <div className="admin-section-header">
          <h2>Aktiver Eltern- und Ausbildersprechtag</h2>
        </div>
        <div className="teacher-form-container">
          {activeEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, color: '#111827' }}>{activeEvent.name}</div>
              <div style={{ color: '#4b5563' }}>
                Schuljahr: {activeEvent.school_year} • Status: {statusLabel[activeEvent.status]}
              </div>
              <div style={{ color: '#4b5563' }}>
                Buchungsfenster: {formatDateTime(activeEvent.booking_opens_at) || 'sofort'} – {formatDateTime(activeEvent.booking_closes_at) || 'offen'}
              </div>

              {user?.role === 'admin' && (
                <div style={{ color: '#4b5563' }}>
                  {activeEventStats ? (
                    <>
                      Slots: {activeEventStats.totalSlots} gesamt • {activeEventStats.availableSlots} verfügbar • {activeEventStats.reservedSlots} reserviert • {activeEventStats.confirmedSlots} bestätigt
                    </>
                  ) : activeEventStatsError ? (
                    <>Slots: {activeEventStatsError}</>
                  ) : (
                    <>Slots: Laden…</>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#4b5563' }}>
              Kein aktiver Eltern- und Ausbildersprechtag gefunden (nicht veröffentlicht oder außerhalb des Buchungsfensters).
            </div>
          )}
        </div>

        {/* Navigation ist im Menü gebündelt */}

        {/* Counter removed per request */}

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        <div className="admin-section-header">
          <h2>Buchungen des Kollegiums</h2>
          <div className="tooltip-container">
            <button
              onClick={handleExportAll}
              className="btn-primary"
              disabled={bookings.length === 0}
            >
              📅 Alle Termine als Kalenderdatei exportieren
            </button>
            <span className="tooltip">
              {bookings.length === 0
                ? 'Keine Buchungen zum Exportieren'
                : 'Exportiert alle Termine als .ics Kalenderdatei'}
            </span>
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="no-bookings">
            <p>Keine Buchungen vorhanden.</p>
            <a href="/" className="back-to-booking">Zur Buchungsseite</a>
          </div>
        ) : (
          <div className="bookings-table-container">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>Lehrkraft</th>
                  <th>Fach</th>
                  <th>Datum</th>
                  <th>Zeit</th>
                  <th>Typ</th>
                  <th>Besuchende</th>
                  <th>Vertreter*in</th>
                  <th>Schüler*in/Azubi</th>
                  <th>Klasse</th>
                  <th>E-Mail</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="teacher-name">{booking.teacherName}</td>
                    <td>{booking.teacherSubject}</td>
                    <td>{booking.date}</td>
                    <td>{booking.time}</td>
                    <td>{booking.visitorType === 'parent' ? 'Erziehungsberechtigte' : 'Ausbildungsbetrieb'}</td>
                    <td>
                      {booking.visitorType === 'parent' 
                        ? booking.parentName 
                        : booking.companyName}
                    </td>
                    <td>
                      {booking.visitorType === 'company' ? (booking.representativeName || '-') : '-'}
                    </td>
                    <td>
                      {booking.visitorType === 'parent' 
                        ? booking.studentName 
                        : booking.traineeName}
                    </td>
                    <td>{booking.className}</td>
                    <td style={{ fontSize: '0.85rem' }}>{booking.email}</td>
                    <td>
                      <button
                        onClick={() => handleCancelBooking(booking.id)}
                        className="cancel-button"
                      >
                        Stornieren
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
