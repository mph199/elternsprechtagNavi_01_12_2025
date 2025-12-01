import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot as ApiBooking } from '../types';
import { exportBookingsToICal } from '../utils/icalExport';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function AdminDashboard() {
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.admin.getBookings();
      
      // Filter bookings for teachers - only show their own
      const filteredData = user?.role === 'teacher' && user?.teacherId
        ? data.filter(booking => booking.teacherId === user.teacherId)
        : data;
      
      setBookings(filteredData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Buchungen');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

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
    <div className="admin-dashboard">
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
              onClick={() => navigate('/admin/settings')} 
              className="admin-action-button"
            >
              <span className="action-icon">⚙️</span>
              <div>
                <div className="action-title">Einstellungen</div>
                <div className="action-desc">Event-Name und Datum konfigurieren</div>
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

        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-value">{bookings.length}</div>
            <div className="stat-label">
              {user?.role === 'teacher' ? 'Meine gebuchten Termine' : 'Gebuchte Termine'}
            </div>
          </div>
          {bookings.length > 0 && (
            <button
              onClick={() => exportBookingsToICal(bookings)}
              className="btn-primary"
              style={{ marginLeft: '1rem' }}
            >
              📅 Alle als Kalender exportieren
            </button>
          )}
        </div>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

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
                  <th>Besucher</th>
                  <th>Schüler/Azubi</th>
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
                    <td>{booking.visitorType === 'parent' ? '👨‍👩‍👧' : '🏢'}</td>
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
