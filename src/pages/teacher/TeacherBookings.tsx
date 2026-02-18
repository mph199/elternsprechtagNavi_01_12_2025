import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../services/api';
import type { TimeSlot } from '../../types';
import { exportBookingsToICal } from '../../utils/icalExport';
import type { TeacherOutletContext } from './TeacherLayout';

export function TeacherBookings() {
  const { teacher } = useOutletContext<TeacherOutletContext>();

  const [bookings, setBookings] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'parent' | 'company'>('all');

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.teacher.getBookings();
      setBookings(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Buchungen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => {
      if (typeFilter !== 'all' && b.visitorType !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        b.parentName,
        b.companyName,
        b.studentName,
        b.traineeName,
        b.className,
        b.email,
        b.time,
        b.date,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, query, typeFilter]);

  const handleCancelBooking = async (booking: TimeSlot) => {
    const slotId = booking.id;
    setError('');
    setNotice('');

    if (booking.status === 'confirmed') {
      const typed = prompt(
        'Dieser Termin wurde bereits bestätigt.\n\nSind Sie sicher, dass Sie den Termin stornieren möchten? Die/der Besuchende wird darüber informiert.\n\nBitte geben Sie zur Bestätigung exakt "Stornieren" ein:'
      );
      if (typed !== 'Stornieren') {
        setNotice('Stornierung nicht bestätigt.');
        return;
      }
    } else {
      if (!confirm('Möchten Sie diese Buchung wirklich stornieren?')) return;
    }

    try {
      await api.teacher.cancelBooking(slotId);
      await loadBookings();
      setNotice('Buchung erfolgreich storniert');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Stornieren');
    }
  };

  const handleAcceptBooking = async (slotId: number) => {
    setError('');
    setNotice('');
    try {
      await api.teacher.acceptBooking(slotId);
      await loadBookings();
      setNotice('Buchung bestätigt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Bestätigen');
    }
  };

  const exportICal = () => {
    setError('');
    setNotice('');

    if (!filtered.length) {
      setNotice('Keine Buchungen zum Exportieren.');
      return;
    }

    exportBookingsToICal(
      filtered.map((b) => ({ ...b, teacherName: teacher?.name || 'Lehrkraft' })),
      undefined,
      { defaultRoom: teacher?.room }
    );
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <>
      {(error || notice) && (
        <div className={error ? 'admin-error' : 'admin-success'} style={{ marginBottom: 16 }}>
          {error || notice}
          <button
            onClick={() => {
              setError('');
              setNotice('');
            }}
            style={{ marginLeft: 12 }}
            className="back-button"
          >
            Schließen
          </button>
        </div>
      )}

      <div className="admin-stats" style={{ gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ flex: '1 1 360px', minWidth: 240, padding: '1.1rem 1.1rem' }}>
          <h3>Filter</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Suche (Name, Klasse, E-Mail)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ padding: '8px 10px', flex: '1 1 200px' }}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'parent' | 'company')}
              style={{ padding: '8px 10px', flex: '0 1 200px' }}
            >
              <option value="all">Alle</option>
              <option value="parent">Erziehungsberechtigte</option>
              <option value="company">Ausbildungsbetrieb</option>
            </select>
            <button type="button" className="btn-secondary" onClick={loadBookings}>
              Aktualisieren
            </button>
          </div>
        </div>

        <div className="stat-card" style={{ flex: '0 0 220px', minWidth: 220, padding: '1.1rem 1.1rem' }}>
          <h3>Meine Termine</h3>
          <p className="stat-number">{bookings.length}</p>
          <p className="stat-label">Gebuchte Gespräche</p>
        </div>
      </div>

      <section className="stat-card teacher-table-section" style={{ padding: '1.1rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Buchungen einsehen</h3>
          <button type="button" className="btn-secondary" onClick={loadBookings}>
            Aktualisieren
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button onClick={exportICal} className="btn-primary" disabled={bookings.length === 0}>
            📅 Alle Termine als Kalenderdatei exportieren
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="no-bookings">
            <p>Noch keine Buchungen vorhanden.</p>
          </div>
        ) : (
          <div className="bookings-table-container teacher-bookings-table-container teacher-my-bookings-table-container">
            <table className="bookings-table teacher-bookings-table teacher-my-bookings-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Zeit</th>
                  <th>Typ</th>
                  <th>Name</th>
                  <th>Schüler*in/Azubi</th>
                  <th>Klasse</th>
                  <th>E-Mail</th>
                  <th>Nachricht</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booking) => (
                  <tr key={booking.id}>
                    <td data-label="Datum">{booking.date}</td>
                    <td data-label="Zeit">{booking.time}</td>
                    <td data-label="Typ">
                      {booking.visitorType === 'parent' ? (
                        <span className="badge badge-parent">Erziehungsberechtigte</span>
                      ) : (
                        <span className="badge badge-company">Ausbildungsbetrieb</span>
                      )}
                    </td>
                    <td data-label="Name">
                      {booking.visitorType === 'parent' ? (
                        booking.parentName
                      ) : (
                        <div>
                          <div>{booking.companyName}</div>
                          {booking.representativeName && (
                            <small>Vertreter*in: {booking.representativeName}</small>
                          )}
                        </div>
                      )}
                    </td>
                    <td data-label="Schüler*in/Azubi">{booking.visitorType === 'parent' ? booking.studentName : booking.traineeName}</td>
                    <td data-label="Klasse">{booking.className}</td>
                    <td data-label="E-Mail">
                      <a href={`mailto:${booking.email}`}>{booking.email}</a>
                    </td>
                    <td className="message-cell" data-label="Nachricht">
                      <span className="teacher-message-value">{booking.message || '-'}</span>
                    </td>
                    <td data-label="Aktionen">
                      <div className="action-buttons">
                        {booking.status === 'reserved' && (
                          <div className="tooltip-container">
                            <button
                              onClick={() => handleAcceptBooking(booking.id)}
                              className="btn-primary"
                              disabled={!booking.verifiedAt}
                            >
                              Bestätigen
                            </button>
                            {!booking.verifiedAt && (
                              <span className="tooltip">
                                Erst möglich, wenn die E-Mail-Adresse bestätigt wurde
                              </span>
                            )}
                          </div>
                        )}
                        <button onClick={() => handleCancelBooking(booking)} className="cancel-button">
                          Stornieren
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
