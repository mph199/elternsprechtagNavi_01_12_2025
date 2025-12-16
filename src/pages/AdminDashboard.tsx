import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot as ApiBooking, FeedbackItem } from '../types';
import { exportBookingsToICal } from '../utils/icalExport';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

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
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string>('');
  const [feedbackOpen, setFeedbackOpen] = useState<boolean>(false);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [activeEventStats, setActiveEventStats] = useState<EventStats | null>(null);
  const [activeEventStatsError, setActiveEventStatsError] = useState<string>('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
      setActiveEvent(((res as any)?.event as ActiveEvent) || null);
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

  const loadFeedback = useCallback(async () => {
    if (user?.role !== 'admin') {
      setFeedback([]);
      setFeedbackError('');
      return;
    }
    try {
      setFeedbackLoading(true);
      setFeedbackError('');
      const items = await api.admin.listFeedback();
      setFeedback((items || []) as FeedbackItem[]);
    } catch (e) {
      setFeedback([]);
      setFeedbackError(e instanceof Error ? e.message : 'Fehler beim Laden des Feedbacks');
    } finally {
      setFeedbackLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    loadActiveEvent();
  }, [loadActiveEvent]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
        <Breadcrumbs />
        <div className="spinner"></div>
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard admin-dashboard--admin">
      <header className="admin-header">
        <div className="admin-header-content">
          <Breadcrumbs />
          <div>
            <p className="admin-user">Angemeldet als: <strong>{user?.username}</strong></p>
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/')} className="back-button">
              ← Zur Buchungsseite
            </button>
            <button onClick={handleLogout} className="logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="stat-card" style={{ marginBottom: 12, padding: '1rem 1.1rem' }}>
          <h3 style={{ marginTop: 0 }}>Aktiver Elternsprechtag</h3>
          {activeEvent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{activeEvent.name}</div>
              <div style={{ color: '#555' }}>
                Schuljahr: {activeEvent.school_year} • Status: {statusLabel[activeEvent.status]}
              </div>
              <div style={{ color: '#555' }}>
                Buchungsfenster: {formatDateTime(activeEvent.booking_opens_at) || 'sofort'} – {formatDateTime(activeEvent.booking_closes_at) || 'offen'}
              </div>

              {user?.role === 'admin' && (
                <div style={{ color: '#555' }}>
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
            <div style={{ color: '#555' }}>
              Kein aktiver Elternsprechtag gefunden (nicht veröffentlicht oder außerhalb des Buchungsfensters).
            </div>
          )}
        </div>

        {user?.role === 'admin' && (
          <div className="admin-actions">
            <button 
              onClick={() => navigate('/admin/teachers')} 
              className="admin-action-button"
            >
              <span className="action-icon">👨‍🏫</span>
              <div>
                <div className="action-title">Lehrkräfte verwalten</div>
                <div className="action-desc">Lehrkräfte anlegen, bearbeiten und löschen</div>
              </div>
            </button>
            <button 
              onClick={() => navigate('/admin/events')} 
              className="admin-action-button"
            >
              <span className="action-icon">🗓️</span>
              <div>
                <div className="action-title">Elternsprechtage</div>
                <div className="action-desc">Events anlegen, veröffentlichen und Slots generieren</div>
              </div>
            </button>
            <button 
              onClick={() => navigate('/admin/slots')} 
              className="admin-action-button"
            >
              <span className="action-icon">📅</span>
              <div>
                <div className="action-title">Termine verwalten</div>
                <div className="action-desc">Zeitslots anlegen, bearbeiten und löschen</div>
              </div>
            </button>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="teacher-form-container" style={{ marginBottom: '1.25rem' }}>
            <div className="admin-feedback-header">
              <h3 className="admin-feedback-title">Feedback (anonym)</h3>
              <div className="admin-feedback-actions">
                <button
                  type="button"
                  className="btn-secondary btn-secondary--sm"
                  onClick={() => setFeedbackOpen((v) => !v)}
                  aria-expanded={feedbackOpen}
                  aria-controls="admin-feedback-panel"
                >
                  {feedbackOpen ? 'Ausblenden' : 'Anzeigen'}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-secondary--sm"
                  onClick={loadFeedback}
                  disabled={feedbackLoading}
                >
                  {feedbackLoading ? 'Laden…' : 'Aktualisieren'}
                </button>
              </div>
            </div>

            {feedbackOpen && (
              <div id="admin-feedback-panel">
                {feedbackError && <div className="admin-error">{feedbackError}</div>}

                {!feedbackError && (feedbackLoading ? (
                  <div style={{ color: '#555' }}>Lade Feedback…</div>
                ) : feedback.length === 0 ? (
                  <div style={{ color: '#555' }}>Noch kein Feedback vorhanden.</div>
                ) : (
                  <div className="bookings-table-container" style={{ marginTop: 10 }}>
                    <table className="bookings-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Nachricht</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feedback.map((f) => (
                          <tr key={f.id}>
                            <td>{formatDateTime(f.created_at) || f.created_at}</td>
                            <td className="message-cell">{f.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Counter removed per request */}

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 0 0.5rem 0' }}>
          <div className="tooltip-container">
            <button
              onClick={handleExportAll}
              className="btn-primary"
              disabled={bookings.length === 0}
            >
              📅 Alle Termine in den Kalender exportieren
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
