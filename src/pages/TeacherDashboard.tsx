import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot, Settings } from '../types';
import { exportBookingsToICal } from '../utils/icalExport';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function TeacherDashboard() {
  const [bookings, setBookings] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>('');
  const [teacher, setTeacher] = useState<{ id: number; name: string; subject: string; system?: string; room?: string } | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'parent' | 'company'>('all');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.teacher.getBookings();
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Buchungen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load bookings, teacher info, and settings in parallel
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [b, t, s] = await Promise.all([
          api.teacher.getBookings(),
          api.teacher.getInfo().catch(() => null),
          api.admin.getSettings().catch(() => null),
        ]);
        setBookings(b);
        if (t) setTeacher(t as any);
        if (s) setSettings(s as any);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCancelBooking = async (slotId: number) => {
    if (!confirm('Möchten Sie diese Buchung wirklich stornieren?')) {
      return;
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
    try {
      await api.teacher.acceptBooking(slotId);
      await loadBookings();
      setNotice('Buchung bestätigt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Bestätigen');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter(b => {
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
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, query, typeFilter]);
  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Laden...</p>
      </div>
    );
  }


  const exportICal = () => {
    if (!filtered.length) {
      setNotice('Keine Buchungen zum Exportieren.');
      return;
    }
    exportBookingsToICal(
      (filtered as any[]).map(b => ({ ...b, teacherName: teacher?.name || 'Lehrkraft' })),
      settings || undefined
    );
  };

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-content">
          <Breadcrumbs />
          <div>
            <p className="admin-user">Angemeldet als: <strong>{user?.username}</strong></p>
            {teacher && (
              <p className="admin-user">
                {teacher.name} • {teacher.subject}
                {teacher.room ? ` • Raum ${teacher.room}` : ''}
                {teacher.system ? ` • System: ${teacher.system}` : ''}
              </p>
            )}
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/')} className="back-button">
              ← Zur Buchungsseite
            </button>
            <button onClick={loadBookings} className="logout-button" style={{ backgroundColor: '#2d5016' }}>
              Aktualisieren
            </button>
            <button onClick={exportICal} className="logout-button" style={{ backgroundColor: '#6f42c1' }}>
              iCal Export
            </button>
            <button onClick={handleLogout} className="logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
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

        <div className="admin-stats">
          <div className="stat-card" style={{ flex: 1 }}>
            <h3>Filter</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Suche (Name, Klasse, E-Mail)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ padding: 8, flex: 1 }}
              />
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} style={{ padding: 8 }}>
                <option value="all">Alle</option>
                <option value="parent">Eltern</option>
                <option value="company">Ausbilder</option>
              </select>
            </div>
          </div>
          <div className="stat-card" style={{ minWidth: 220 }}>
            <h3>Meine Termine</h3>
            <p className="stat-number">{bookings.length}</p>
            <p className="stat-label">Gebuchte Gespräche</p>
          </div>
        </div>

        <section className="admin-section">
          <h2>Meine Buchungen</h2>

          {filtered.length === 0 ? (
            <div className="no-bookings">
              <p>Noch keine Buchungen vorhanden.</p>
            </div>
          ) : (
            <div className="bookings-table-container">
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Zeit</th>
                    <th>Typ</th>
                    <th>Name</th>
                    <th>Schüler/Azubi</th>
                    <th>Klasse</th>
                    <th>E-Mail</th>
                    <th>Nachricht</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.date}</td>
                      <td>{booking.time}</td>
                      <td>
                        {booking.visitorType === 'parent' ? (
                          <span className="badge badge-parent">Eltern</span>
                        ) : (
                          <span className="badge badge-company">Ausbilder</span>
                        )}
                      </td>
                      <td>
                        {booking.visitorType === 'parent' 
                          ? booking.parentName 
                          : booking.companyName}
                      </td>
                      <td>
                        {booking.visitorType === 'parent' 
                          ? booking.studentName 
                          : booking.traineeName}
                      </td>
                      <td>{booking.className}</td>
                      <td>
                        <a href={`mailto:${booking.email}`}>{booking.email}</a>
                      </td>
                      <td className="message-cell">
                        {booking.message || '-'}
                      </td>
                      <td>
                        {booking.status === 'reserved' && (
                          <button
                            onClick={() => handleAcceptBooking(booking.id)}
                            className="edit-button"
                            style={{ marginRight: 8 }}
                          >
                            Bestätigen
                          </button>
                        )}
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
        </section>
      </main>
    </div>
  );
}
