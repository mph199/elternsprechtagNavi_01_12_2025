import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot } from '../types';
import { exportBookingsToICal } from '../utils/icalExport';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

type TeacherInfo = {
  id: number;
  name: string;
  subject: string;
  system?: string;
  room?: string;
};

export function TeacherDashboard() {
  const [bookings, setBookings] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);
  const [roomDraft, setRoomDraft] = useState<string>('');
  const [savingRoom, setSavingRoom] = useState<boolean>(false);
  const [showRoomDialog, setShowRoomDialog] = useState<boolean>(false);
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
    // Load bookings and teacher info in parallel
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [b, t] = await Promise.all([
          api.teacher.getBookings(),
          api.teacher.getInfo().catch(() => null),
        ]);
        setBookings(b);
        if (t) {
          const ti = t as TeacherInfo;
          setTeacher(ti);
          setRoomDraft(ti.room || '');
        }
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

  const handleChangePassword = async () => {
    setError('');
    setNotice('');
    if (!currentPassword || !newPassword) {
      setError('Bitte aktuelles und neues Passwort eingeben.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Neues Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    try {
      await api.teacher.changePassword(currentPassword, newPassword);
      setNotice('Passwort erfolgreich geändert.');
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ändern des Passworts');
    }
  };

  const handleSaveRoom = async (): Promise<boolean> => {
    setError('');
    setNotice('');
    if (!teacher) {
      setError('Lehrkraftdaten konnten nicht geladen werden.');
      return false;
    }

    const next = roomDraft.trim();
    if (next.length > 60) {
      setError('Raum darf maximal 60 Zeichen lang sein.');
      return false;
    }

    try {
      setSavingRoom(true);
      const updated = await api.teacher.updateRoom(next.length ? next : null);
      if (updated) {
        setTeacher(updated as TeacherInfo);
        setRoomDraft((updated as TeacherInfo).room || '');
      }
      setNotice('Raum gespeichert.');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern des Raums');
      return false;
    } finally {
      setSavingRoom(false);
    }
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
      filtered.map((b) => ({ ...b, teacherName: teacher?.name || 'Lehrkraft' })),
      undefined
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
            <button onClick={() => setShowPasswordForm(v => !v)} className="logout-button" style={{ backgroundColor: '#444' }}>
              Passwort ändern
            </button>
            <button onClick={handleLogout} className="logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {showRoomDialog && teacher && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Raum ändern"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowRoomDialog(false);
              }
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 1000,
            }}
          >
            <div
              className="stat-card"
              style={{
                width: 'min(560px, 100%)',
                maxHeight: 'calc(100vh - 32px)',
                overflow: 'auto',
              }}
            >
              <h3>Raum ändern</h3>
              <p style={{ marginTop: 0, color: '#555' }}>
                Hinweis: Räume sollten nur geändert werden, wenn dies zuvor mit dem Sekretariat abgestimmt wurde.
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="z.B. B204"
                  value={roomDraft}
                  onChange={(e) => setRoomDraft(e.target.value)}
                  style={{ padding: 8, flex: 1, minWidth: 220 }}
                  aria-label="Neuer Raum"
                  disabled={savingRoom}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setShowRoomDialog(false);
                    setRoomDraft(teacher.room || '');
                  }}
                  className="back-button"
                  disabled={savingRoom}
                >
                  Abbrechen
                </button>
                <button
                  onClick={async () => {
                    const ok = await handleSaveRoom();
                    if (ok) {
                      setShowRoomDialog(false);
                    }
                  }}
                  className="btn-primary"
                  disabled={savingRoom}
                >
                  {savingRoom ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        )}

        {teacher && (
          <div className="stat-card" style={{ marginBottom: 16 }}>
            <h3>Raum</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Derzeitiger Raum</div>
                <div
                  style={{
                    background: '#eee',
                    padding: '8px 10px',
                    borderRadius: 6,
                    display: 'inline-block',
                    color: '#333',
                    minWidth: 120,
                    textAlign: 'center',
                  }}
                >
                  {teacher.room ? teacher.room : '—'}
                </div>
              </div>

              <button
                onClick={() => {
                  setError('');
                  setNotice('');
                  setRoomDraft(teacher.room || '');
                  setShowRoomDialog(true);
                }}
                className="btn-primary"
                disabled={savingRoom}
              >
                Raumänderung vornehmen
              </button>
            </div>
          </div>
        )}
        {showPasswordForm && (
          <div className="stat-card" style={{ marginBottom: 16 }}>
            <h3>Passwort ändern</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="password"
                placeholder="Aktuelles Passwort"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{ padding: 8, flex: 1, minWidth: 220 }}
              />
              <input
                type="password"
                placeholder="Neues Passwort (min. 8 Zeichen)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ padding: 8, flex: 1, minWidth: 220 }}
              />
              <button onClick={handleChangePassword} className="btn-primary">
                Speichern
              </button>
            </div>
          </div>
        )}
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
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | 'parent' | 'company')}
                style={{ padding: 8 }}
              >
                <option value="all">Alle</option>
                <option value="parent">Erziehungsberechtigte</option>
                <option value="company">Ausbildungsbetrieb</option>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 0 0.5rem 0' }}>
            <div className="tooltip-container">
              <button
                onClick={exportICal}
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
                      <td>{booking.date}</td>
                      <td>{booking.time}</td>
                      <td>
                        {booking.visitorType === 'parent' ? (
                          <span className="badge badge-parent">Erziehungsberechtigte</span>
                        ) : (
                          <span className="badge badge-company">Ausbildungsbetrieb</span>
                        )}
                      </td>
                      <td>
                        {booking.visitorType === 'parent' 
                          ? booking.parentName 
                          : (
                            <div>
                              <div>{booking.companyName}</div>
                              {booking.representativeName && (
                                <small>Vertreter*in: {booking.representativeName}</small>
                              )}
                            </div>
                          )}
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
                        <div className="action-buttons">
                          {booking.status === 'reserved' && (
                            <button
                              onClick={() => handleAcceptBooking(booking.id)}
                              className="btn-primary"
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
                        </div>
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
