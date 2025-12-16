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
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [sendingFeedback, setSendingFeedback] = useState<boolean>(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState<boolean>(false);
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

  const handleCancelBooking = async (booking: TimeSlot) => {
    const slotId = booking.id;
    if (booking.status === 'confirmed') {
      const typed = prompt(
        'Dieser Termin wurde bereits bestätigt.\n\nSind Sie sicher, dass Sie den Termin stornieren möchten? Die/der Besuchende wird darüber informiert.\n\nBitte geben Sie zur Bestätigung exakt "Stornieren" ein:'
      );
      if (typed !== 'Stornieren') {
        setNotice('Stornierung nicht bestätigt.');
        return;
      }
    } else {
      if (!confirm('Möchten Sie diese Buchung wirklich stornieren?')) {
        return;
      }
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

  const handleSubmitFeedback = async () => {
    setError('');
    setNotice('');

    const message = feedbackMessage.trim();
    if (!message) {
      setError('Bitte eine Nachricht eingeben.');
      return;
    }
    if (message.length > 2000) {
      setError('Nachricht darf maximal 2000 Zeichen lang sein.');
      return;
    }

    try {
      setSendingFeedback(true);
      await api.teacher.submitFeedback(message);
      setFeedbackMessage('');
      setNotice('Vielen Dank! Feedback wurde anonym übermittelt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback konnte nicht gesendet werden.');
    } finally {
      setSendingFeedback(false);
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
      undefined,
      { defaultRoom: teacher?.room }
    );
  };

  return (
    <div className="admin-dashboard admin-dashboard--teacher">
      <header className="admin-header">
        <div className="admin-header-content admin-header-content--teacher">
          <Breadcrumbs />
          <div className="admin-header-meta">
            <p className="admin-user">Angemeldet als: <strong>{user?.username}</strong></p>
            {teacher && (
              <p className="admin-user">
                {teacher.name}
                {teacher.room ? ` • Raum ${teacher.room}` : ''}
              </p>
            )}
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/')} className="back-button">
              ← Zur Buchungsseite
            </button>
            <button onClick={() => setShowPasswordForm(v => !v)} className="logout-button" style={{ backgroundColor: '#444' }}>
              Passwort ändern
            </button>
            <button onClick={handleLogout} className="logout-button logout-button-danger">
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
              padding: 12,
              zIndex: 1000,
            }}
          >
            <div
              className="stat-card"
              style={{
                width: 'min(520px, 100%)',
                maxHeight: 'calc(100vh - 24px)',
                overflow: 'auto',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Raum ändern</h3>
              <p style={{ marginTop: 4, marginBottom: 12, color: '#555', lineHeight: 1.35 }}>
                Hinweis: Räume sollten nur geändert werden, wenn dies zuvor mit dem Sekretariat abgestimmt wurde.
              </p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="z.B. B204"
                  value={roomDraft}
                  onChange={(e) => setRoomDraft(e.target.value)}
                  style={{ padding: '8px 10px', flex: 1, minWidth: 220 }}
                  aria-label="Neuer Raum"
                  disabled={savingRoom}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
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
                  style={{ padding: '0.6rem 1.05rem' }}
                >
                  {savingRoom ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
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
            </div>
          </div>

          {teacher && (
            <div className="stat-card" style={{ flex: '0 1 330px', minWidth: 240, padding: '1.1rem 1.1rem' }}>
              <h3>Raum</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#666' }}>Derzeitiger Raum</div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'nowrap' }}>
                  <div
                    style={{
                      background: '#eee',
                      padding: '7px 10px',
                      borderRadius: 8,
                      display: 'inline-block',
                      color: '#333',
                      minWidth: 120,
                      textAlign: 'center',
                      flex: '0 0 auto',
                    }}
                  >
                    {teacher.room ? teacher.room : '—'}
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
                    style={{ padding: '0.55rem 0.9rem', whiteSpace: 'nowrap', marginLeft: 'auto' }}
                  >
                    Raum ändern
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="stat-card" style={{ flex: '0 0 220px', minWidth: 220, padding: '1.1rem 1.1rem' }}>
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
                            <div className="tooltip-container">
                              <button
                                onClick={() => handleAcceptBooking(booking.id)}
                                className="btn-primary"
                                disabled={!booking.verifiedAt}
                              >
                                Bestätigen
                              </button>
                              {!booking.verifiedAt && (
                                <span className="tooltip">Erst möglich, wenn die E-Mail-Adresse bestätigt wurde</span>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => handleCancelBooking(booking)}
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowFeedbackForm((v) => !v)}
            >
              💬 Feedback
            </button>
          </div>

          {showFeedbackForm && (
            <div className="stat-card" style={{ marginTop: 12, marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Feedback</h3>
                <button
                  type="button"
                  className="btn-secondary btn-secondary--sm"
                  onClick={() => setShowFeedbackForm(false)}
                  disabled={sendingFeedback}
                >
                  Schließen
                </button>
              </div>

              <p style={{ marginTop: 10, marginBottom: 12, color: '#555', lineHeight: 1.35 }}>
                Ihre Nachricht wird anonym an die Administration weitergeleitet.
              </p>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label htmlFor="teacherFeedbackMessage">Nachricht</label>
                <textarea
                  id="teacherFeedbackMessage"
                  value={feedbackMessage}
                  onChange={(e) => setFeedbackMessage(e.target.value)}
                  placeholder="Was klappt gut? Was fehlt? Was sollten wir verbessern?"
                  disabled={sendingFeedback}
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmitFeedback}
                  disabled={sendingFeedback}
                >
                  {sendingFeedback ? 'Senden…' : 'Anonym senden'}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
