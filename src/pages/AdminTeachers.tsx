import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { api } from '../services/api';
import type { ApiTeacher } from '../services/api';
import './AdminDashboard.css';

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<ApiTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<ApiTeacher | null>(null);
  const [formData, setFormData] = useState({ name: '', subject: '', system: 'dual' as 'dual' | 'vollzeit' });
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadTeachers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getTeachers();
      setTeachers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Lehrkräfte');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.subject.trim()) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      if (editingTeacher) {
        await api.admin.updateTeacher(editingTeacher.id, formData);
      } else {
        await api.admin.createTeacher(formData);
      }
      await loadTeachers();
      setShowForm(false);
      setEditingTeacher(null);
      setFormData({ name: '', subject: '', system: 'dual' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const handleEdit = (teacher: ApiTeacher) => {
    setEditingTeacher(teacher);
    setFormData({ 
      name: teacher.name, 
      subject: teacher.subject, 
      system: teacher.system || 'dual' // Fallback falls system undefined ist
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Möchten Sie die Lehrkraft "${name}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.admin.deleteTeacher(id);
      await loadTeachers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTeacher(null);
    setFormData({ name: '', subject: '', system: 'dual' });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-content">
          <div>
            <h1>BKSB Elternsprechtag - Verwaltung</h1>
            <p className="admin-user">Angemeldet als: <strong>{user?.username}</strong></p>
          </div>
          <div className="header-actions">
            <button onClick={() => navigate('/admin')} className="back-button">
              ← Zurück zum Dashboard
            </button>
            <button onClick={handleLogout} className="logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-section-header">
          <h2>Lehrkräfte verwalten</h2>
          {!showForm && (
            <button 
              onClick={() => setShowForm(true)} 
              className="btn-primary"
            >
              + Neue Lehrkraft
            </button>
          )}
        </div>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {showForm && (
          <div className="teacher-form-container">
            <h3>{editingTeacher ? 'Lehrkraft bearbeiten' : 'Neue Lehrkraft anlegen'}</h3>
            <form onSubmit={handleSubmit} className="teacher-form">
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Max Mustermann"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="subject">Fach</label>
                <input
                  id="subject"
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="z.B. Mathematik"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="system">System</label>
                <select
                  id="system"
                  value={formData.system}
                  onChange={(e) => setFormData({ ...formData, system: e.target.value as 'dual' | 'vollzeit' })}
                  required
                >
                  <option value="dual">Duales System (16:00 - 18:00 Uhr)</option>
                  <option value="vollzeit">Vollzeit System (17:00 - 19:00 Uhr)</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingTeacher ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {teachers.length === 0 ? (
          <div className="no-teachers">
            <p>Keine Lehrkräfte vorhanden.</p>
          </div>
        ) : (
          <div className="teachers-table-container">
            <table className="bookings-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Fach</th>
                  <th>System</th>
                  <th>Sprechstunde</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td>{teacher.id}</td>
                    <td className="teacher-name">{teacher.name}</td>
                    <td>{teacher.subject}</td>
                    <td>{teacher.system === 'vollzeit' ? 'Vollzeit' : 'Dual'}</td>
                    <td>{teacher.system === 'vollzeit' ? '17:00 - 19:00 Uhr' : '16:00 - 18:00 Uhr'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          onClick={() => handleEdit(teacher)}
                          className="edit-button"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDelete(teacher.id, teacher.name)}
                          className="cancel-button"
                        >
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
      </main>
    </div>
  );
}
