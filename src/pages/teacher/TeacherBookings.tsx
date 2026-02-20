import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../../services/api';
import type { TimeSlot } from '../../types';
import { exportBookingsToICal } from '../../utils/icalExport';
import type { TeacherOutletContext } from './TeacherLayout';

type SortKey = 'when' | 'visitor';
type SortDir = 'asc' | 'desc';

function parseDateValue(value?: string | null): number | null {
  if (!value) return null;
  // ISO date: YYYY-MM-DD
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(value)) {
    const [y, m, d] = value.split('-').map((n) => Number(n));
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }

  // German date: DD.MM.YYYY
  const de = /^\d{2}\.\d{2}\.\d{4}$/;
  if (de.test(value)) {
    const [d, m, y] = value.split('.').map((n) => Number(n));
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback.getTime();
}

function parseStartMinutes(value?: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function visitorLabel(b: TimeSlot): string {
  if (b.visitorType === 'parent') return (b.parentName || '').trim();
  return (b.companyName || '').trim();
}

function statusLabel(status?: string | null): string {
  if (!status) return '—';
  if (status === 'confirmed') return 'Bestätigt';
  if (status === 'reserved') return 'Reserviert';
  return status;
}

export function TeacherBookings() {
  const { teacher } = useOutletContext<TeacherOutletContext>();

  const [bookings, setBookings] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'parent' | 'company'>('all');
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: 'asc' });

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
        visitorLabel(b),
        b.representativeName,
        b.studentName,
        b.traineeName,
        b.className,
        b.email,
        b.time,
        b.date,
        b.message,
        b.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, query, typeFilter]);

  const filteredAndSorted = useMemo(() => {
    if (!sort.key) return filtered;

    const dir = sort.dir === 'asc' ? 1 : -1;
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sort.key === 'visitor') {
        const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
        return collator.compare(visitorLabel(a), visitorLabel(b)) * dir;
      }

      const aDate = parseDateValue(a.date);
      const bDate = parseDateValue(b.date);
      if (aDate != null && bDate != null && aDate !== bDate) return (aDate - bDate) * dir;

      const aTime = parseStartMinutes(a.time);
      const bTime = parseStartMinutes(b.time);
      if (aTime != null && bTime != null && aTime !== bTime) return (aTime - bTime) * dir;

      return (a.id - b.id) * dir;
    });
    return copy;
  }, [filtered, sort.dir, sort.key]);

  const cycleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  const clearSort = () => {
    setSort({ key: null, dir: 'asc' });
  };

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

    if (!filteredAndSorted.length) {
      setNotice('Keine Buchungen zum Exportieren.');
      return;
    }

    exportBookingsToICal(
      filteredAndSorted.map((b) => ({ ...b, teacherName: teacher?.name || 'Lehrkraft' })),
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {sort.key && (
              <button type="button" className="btn-secondary btn-secondary--sm" onClick={clearSort}>
                Sortierung zurücksetzen
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={loadBookings}>
              Aktualisieren
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <button onClick={exportICal} className="btn-primary" disabled={bookings.length === 0}>
            📅 Alle Termine als Kalenderdatei exportieren
          </button>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="no-bookings">
            <p>Noch keine Buchungen vorhanden.</p>
          </div>
        ) : (
          <div className="bookings-table-container teacher-bookings-table-container teacher-my-bookings-table-container">
            <table className="bookings-table teacher-bookings-table teacher-my-bookings-table">
              <thead>
                <tr>
                  <th
                    aria-sort={sort.key === 'when' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="teacher-sort-button"
                      onClick={() => cycleSort('when')}
                      aria-label="Nach Termin sortieren"
                    >
                      Termin
                      {sort.key === 'when' ? (
                        <span className="teacher-sort-indicator" aria-hidden="true">
                          {sort.dir === 'asc' ? '▲' : '▼'}
                        </span>
                      ) : (
                        <span className="teacher-sort-indicator teacher-sort-indicator--idle" aria-hidden="true">
                          ↕
                        </span>
                      )}
                    </button>
                  </th>
                  <th
                    aria-sort={sort.key === 'visitor' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="teacher-sort-button"
                      onClick={() => cycleSort('visitor')}
                      aria-label="Nach Besuchenden sortieren"
                    >
                      Besuchende
                      {sort.key === 'visitor' ? (
                        <span className="teacher-sort-indicator" aria-hidden="true">
                          {sort.dir === 'asc' ? '▲' : '▼'}
                        </span>
                      ) : (
                        <span className="teacher-sort-indicator teacher-sort-indicator--idle" aria-hidden="true">
                          ↕
                        </span>
                      )}
                    </button>
                  </th>
                  <th>Schüler*in/Azubi</th>
                  <th>Nachricht</th>
                  <th className="teacher-actions-header">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((booking) => (
                  <tr key={booking.id}>
                    <td data-label="Termin" className="teacher-when-cell">
                      <div className="teacher-when-main">
                        <span className="teacher-when-date">{booking.date}</span>
                        <span className="teacher-when-time">{booking.time}</span>
                      </div>
                      <div className="teacher-when-sub">
                        <span
                          className={
                            booking.status === 'confirmed'
                              ? 'teacher-status-pill teacher-status-pill--confirmed'
                              : booking.status === 'reserved'
                                ? 'teacher-status-pill teacher-status-pill--reserved'
                                : 'teacher-status-pill teacher-status-pill--reserved'
                          }
                        >
                          {statusLabel(booking.status)}
                        </span>
                      </div>
                    </td>

                    <td data-label="Besuchende" className="teacher-visitor-cell">
                      <div className="teacher-visitor-name" title={visitorLabel(booking)}>
                        {visitorLabel(booking) || '—'}
                      </div>
                      {booking.visitorType === 'company' && booking.representativeName && (
                        <div className="teacher-visitor-meta" title={booking.representativeName}>
                          Vertreter*in: {booking.representativeName}
                        </div>
                      )}
                      {booking.email && (
                        <div className="teacher-visitor-meta teacher-visitor-meta--email" title={booking.email}>
                          <a href={`mailto:${booking.email}`} aria-label={`E-Mail an ${visitorLabel(booking) || 'Besuchende'} senden`}>
                            {booking.email}
                          </a>
                        </div>
                      )}
                    </td>

                    <td data-label="Schüler*in/Azubi" className="teacher-student-cell">
                      <div className="teacher-student-name" title={booking.visitorType === 'parent' ? booking.studentName : booking.traineeName}>
                        {booking.visitorType === 'parent' ? booking.studentName : booking.traineeName}
                      </div>
                      <div className="teacher-student-meta" title={booking.className}>
                        Klasse: {booking.className || '—'}
                      </div>
                    </td>

                    <td className="message-cell" data-label="Nachricht">
                      <span
                        className="teacher-message-value teacher-cell-truncate"
                        title={booking.message || ''}
                      >
                        {booking.message || '—'}
                      </span>
                    </td>

                    <td data-label="Aktionen" className="teacher-actions-cell">
                      <div className="action-buttons">
                        {booking.status === 'reserved' && (
                          <div className="tooltip-container">
                            <button
                              onClick={() => handleAcceptBooking(booking.id)}
                              className="btn-primary"
                              disabled={!booking.verifiedAt}
                            >
                              <span aria-hidden="true">✓</span> Bestätigen
                            </button>
                            {!booking.verifiedAt && (
                              <span className="tooltip">
                                Erst möglich, wenn die E-Mail-Adresse bestätigt wurde
                              </span>
                            )}
                          </div>
                        )}
                        <button onClick={() => handleCancelBooking(booking)} className="cancel-button">
                          <span aria-hidden="true">✕</span> Stornieren
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
