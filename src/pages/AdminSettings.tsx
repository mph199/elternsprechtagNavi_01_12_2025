import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { Settings as ApiSettings } from '../types';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function AdminSettings() {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({ event_name: '', event_date: '' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.admin.getSettings();
      setSettings(data);
      setFormData({
        event_name: data.event_name,
        event_date: data.event_date,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Einstellungen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.event_name.trim() || !formData.event_date) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      setError('');
      setSuccess('');
      await api.admin.updateSettings(formData);
      setSuccess('Einstellungen erfolgreich gespeichert!');
      await loadSettings();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
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
            <button onClick={() => navigate('/admin')} className="back-button">
              Dashboard
            </button>
            <button onClick={handleLogout} className="logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-section-header">
          <h2>Event-Einstellungen</h2>
        </div>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {success && (
          <div className="admin-success">
            {success}
          </div>
        )}

        <div className="teacher-form-container">
          <h3>Event-Konfiguration</h3>
          <form onSubmit={handleSubmit} className="teacher-form">
            <div className="form-group">
              <label htmlFor="event_name">Event-Name</label>
              <input
                id="event_name"
                type="text"
                value={formData.event_name}
                onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
                placeholder="z.B. BKSB Elternsprechtag"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="event_date">Event-Datum</label>
              <input
                id="event_date"
                type="date"
                value={formData.event_date}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                required
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                Einstellungen speichern
              </button>
            </div>
          </form>
        </div>

        {settings && (
          <div className="settings-info">
            <h3>Aktuelle Einstellungen</h3>
            <div className="info-card">
              <p><strong>Event:</strong> {settings.event_name}</p>
              <p><strong>Datum:</strong> {new Date(settings.event_date).toLocaleDateString('de-DE')}</p>
              {settings.updated_at && (
                <p className="text-muted">
                  <small>Zuletzt aktualisiert: {new Date(settings.updated_at).toLocaleString('de-DE')}</small>
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
