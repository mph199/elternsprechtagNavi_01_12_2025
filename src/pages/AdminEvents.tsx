import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import './AdminDashboard.css';

type AdminEvent = {
  id: number;
  name: string;
  school_year: string;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'published' | 'closed';
  booking_opens_at?: string | null;
  booking_closes_at?: string | null;
  timezone?: string | null;
};
type EventResponse = { event: AdminEvent };

type GenerateSlotsResponse = {
  success?: boolean;
  created?: number;
  skipped?: number;
  eventDate?: string;
  error?: string;
  message?: string;
};

function inputDateTimeToIso(value: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatEventDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function AdminEvents() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [creating, setCreating] = useState(false);
  const [createData, setCreateData] = useState({
    name: '',
    school_year: '',
    starts_at: '',
    ends_at: '',
    booking_opens_at: '',
    booking_closes_at: '',
    status: 'draft' as AdminEvent['status'],
  });

  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.id === selectedEventId) || null : null),
    [events, selectedEventId]
  );

  const [slotMinutes, setSlotMinutes] = useState<number>(15);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);

  const { user, setActiveView } = useAuth();

  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  useEffect(() => {
    if (canSwitchView) setActiveView('admin');
  }, [canSwitchView, setActiveView]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError('');
      const res = (await api.admin.getEvents()) as unknown as AdminEvent[];
      setEvents(res);
      if (res.length && !selectedEventId) setSelectedEventId(res[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const startsIso = inputDateTimeToIso(createData.starts_at);
    const endsIso = inputDateTimeToIso(createData.ends_at);
    const opensIso = inputDateTimeToIso(createData.booking_opens_at);
    const closesIso = inputDateTimeToIso(createData.booking_closes_at);

    if (!createData.name.trim() || !createData.school_year.trim() || !startsIso || !endsIso) {
      setError('Bitte Name, Schuljahr, Start und Ende ausfüllen.');
      return;
    }

    try {
      setCreating(true);
      const res = (await api.admin.createEvent({
        name: createData.name.trim(),
        school_year: createData.school_year.trim(),
        starts_at: startsIso,
        ends_at: endsIso,
        booking_opens_at: opensIso,
        booking_closes_at: closesIso,
        status: createData.status,
        timezone: 'Europe/Berlin',
      })) as EventResponse;

      setSuccess(`Event erstellt: ${res?.event?.name || createData.name}`);
      setCreateData({
        name: '',
        school_year: '',
        starts_at: '',
        ends_at: '',
        booking_opens_at: '',
        booking_closes_at: '',
        status: 'draft',
      });
      await loadEvents();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Fehler beim Erstellen');
    } finally {
      setCreating(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleSetStatus = async (id: number, status: AdminEvent['status']) => {
    setError('');
    setSuccess('');
    try {
      const res = (await api.admin.updateEvent(id, { status })) as EventResponse;
      setSuccess(`Status gesetzt: ${res.event.name} → ${res.event.status}`);
      await loadEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Aktualisieren');
    } finally {
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Event wirklich löschen?')) return;
    setError('');
    setSuccess('');
    try {
      await api.admin.deleteEvent(id);
      setSuccess('Event gelöscht.');
      setSelectedEventId((prev) => (prev === id ? null : prev));
      await loadEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Löschen');
    } finally {
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleGenerateSlots = async () => {
    if (!selectedEventId) {
      setError('Bitte zuerst ein Event auswählen.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const res = (await api.admin.generateEventSlots(selectedEventId, {
        slotMinutes,
        replaceExisting,
      })) as GenerateSlotsResponse;
      const created = res?.created;
      const skipped = res?.skipped;
      const eventDate = res?.eventDate;
      setSuccess(
        `Slots generiert${eventDate ? ` (${eventDate})` : ''}: erstellt ${created ?? '-'}, übersprungen ${skipped ?? '-'}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Generieren');
    } finally {
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Lade Events…</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <main className="admin-main">
        <div className="admin-section-header">
          <h2>Eltern- und Ausbildersprechtage verwalten</h2>
        </div>

        {error && <div className="admin-error">{error}</div>}
        {success && <div className="admin-success">{success}</div>}

        <div className="teacher-form-container">
          <h3>Neues Event anlegen</h3>
          <form onSubmit={handleCreate} className="teacher-form">
            <div className="form-group">
              <label htmlFor="ev_name">Name</label>
              <input
                id="ev_name"
                type="text"
                value={createData.name}
                onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
                placeholder="z.B. Eltern- und Ausbildersprechtag Februar 2026"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ev_year">Schuljahr</label>
              <input
                id="ev_year"
                type="text"
                value={createData.school_year}
                onChange={(e) => setCreateData({ ...createData, school_year: e.target.value })}
                placeholder="2025/26"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ev_starts">Start</label>
              <input
                id="ev_starts"
                type="datetime-local"
                value={createData.starts_at}
                onChange={(e) => setCreateData({ ...createData, starts_at: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="ev_ends">Ende</label>
              <input
                id="ev_ends"
                type="datetime-local"
                value={createData.ends_at}
                onChange={(e) => setCreateData({ ...createData, ends_at: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="ev_opens">Buchung öffnet (optional)</label>
              <input
                id="ev_opens"
                type="datetime-local"
                value={createData.booking_opens_at}
                onChange={(e) => setCreateData({ ...createData, booking_opens_at: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="ev_closes">Buchung schließt (optional)</label>
              <input
                id="ev_closes"
                type="datetime-local"
                value={createData.booking_closes_at}
                onChange={(e) => setCreateData({ ...createData, booking_closes_at: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ev_status">Status</label>
              <select
                id="ev_status"
                value={createData.status}
                onChange={(e) => setCreateData({ ...createData, status: e.target.value as AdminEvent['status'] })}
              >
                <option value="draft">Entwurf</option>
                <option value="published">Veröffentlicht</option>
                <option value="closed">Geschlossen</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Erstelle…' : 'Event erstellen'}
              </button>
            </div>
          </form>
        </div>

        <div className="teacher-form-container">
          <h3>Event auswählen & Slots generieren</h3>
          <div className="form-group">
            <label htmlFor="ev_select">Event</label>
            <select
              id="ev_select"
              value={selectedEventId ?? ''}
              onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Bitte wählen…</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  #{ev.id} · {ev.name} · {ev.status}
                </option>
              ))}
            </select>
          </div>

          {selectedEvent && (
            <div className="info-card" style={{ marginBottom: 12 }}>
              <p>
                <strong>{selectedEvent.name}</strong>
              </p>
              <p>
                Zeitraum: {formatEventDateTime(selectedEvent.starts_at)} – {formatEventDateTime(selectedEvent.ends_at)}
              </p>
              <p>Status: {selectedEvent.status}</p>
            </div>
          )}

          <div className="admin-grid-2" style={{ marginBottom: 4 }}>
            <div className="form-group">
              <label htmlFor="slotMinutes">Slot-Länge (Min.)</label>
              <input
                id="slotMinutes"
                type="number"
                min={5}
                max={60}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Number(e.target.value))}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28 }}>
              <input
                id="replaceExisting"
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <label htmlFor="replaceExisting" style={{ margin: 0 }}>
                Vorherige Slots für diesen Tag ersetzen
              </label>
            </div>
          </div>

          <div className="form-actions" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" onClick={handleGenerateSlots} disabled={!selectedEventId}>
              Slots für alle Lehrkräfte generieren
            </button>

            {selectedEvent?.status !== 'published' && selectedEventId && (
              <button type="button" className="btn-secondary" onClick={() => handleSetStatus(selectedEventId, 'published')}>
                Event veröffentlichen
              </button>
            )}
            {selectedEvent?.status !== 'closed' && selectedEventId && (
              <button type="button" className="btn-secondary" onClick={() => handleSetStatus(selectedEventId, 'closed')}>
                Event schließen
              </button>
            )}
            {selectedEventId && (
              <button type="button" className="btn-secondary" onClick={() => handleSetStatus(selectedEventId, 'draft')}>
                Als Entwurf setzen
              </button>
            )}
          </div>
        </div>

        <div className="teacher-form-container">
          <h3>Alle Events</h3>
          {events.length === 0 ? (
            <div className="no-bookings" style={{ padding: '1.75rem' }}>
              <p style={{ marginBottom: '0.75rem' }}>Keine Events vorhanden.</p>
              <p style={{ color: '#6b7280', margin: 0 }}>
                Lege oben ein Event an und setze es auf „Veröffentlicht“, um Buchungen freizuschalten.
              </p>
            </div>
          ) : (
            <div className="bookings-table-container" style={{ marginTop: '0.25rem' }}>
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Schuljahr</th>
                    <th>Start</th>
                    <th>Ende</th>
                    <th>Status</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} style={ev.id === selectedEventId ? { background: '#f4f7ff' } : undefined}>
                      <td>#{ev.id}</td>
                      <td>{ev.name}</td>
                      <td>{ev.school_year}</td>
                      <td>{formatEventDateTime(ev.starts_at)}</td>
                      <td>{formatEventDateTime(ev.ends_at)}</td>
                      <td>{ev.status}</td>
                      <td>
                        <div className="action-buttons action-buttons--compact">
                          <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => setSelectedEventId(ev.id)}>
                            Auswählen
                          </button>
                          {ev.status !== 'published' && (
                            <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleSetStatus(ev.id, 'published')}>
                              Veröffentlichen
                            </button>
                          )}
                          <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleSetStatus(ev.id, 'draft')}>
                            Entwurf
                          </button>
                          <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleDelete(ev.id)}>
                            Löschen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="teacher-form-container" style={{ padding: '1.25rem 2rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Hinweis</h3>
          <p className="text-muted" style={{ margin: 0, color: '#6b7280' }}>
            „Aktiv“ ist das zuletzt veröffentlichte Event, das innerhalb seines Buchungsfensters liegt.
          </p>
        </div>
      </main>
    </div>
  );
}
