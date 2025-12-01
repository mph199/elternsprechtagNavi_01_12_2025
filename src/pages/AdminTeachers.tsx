import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { Teacher as ApiTeacher } from '../types';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<ApiTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<ApiTeacher | null>(null);
  const [formData, setFormData] = useState({ name: '', system: 'dual' as 'dual' | 'vollzeit', room: '' });
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
    
    if (!formData.name.trim()) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      const teacherData = {
        name: formData.name,
        subject: 'Sprechstunde',
        system: formData.system,
        room: formData.room
      };
      
      if (editingTeacher) {
        await api.admin.updateTeacher(editingTeacher.id, teacherData);
      } else {
        await api.admin.createTeacher(teacherData);
      }
      await loadTeachers();
      setShowForm(false);
      setEditingTeacher(null);
      setFormData({ name: '', system: 'dual', room: '' });
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const handleEdit = (teacher: ApiTeacher) => {
    setEditingTeacher(teacher);
    setFormData({ 
      name: teacher.name, 
      system: teacher.system || 'dual', // Fallback falls system undefined ist
      room: teacher.room || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Möchten Sie die Lehrkraft "${name}" wirklich löschen?\n\nHinweis: Die Lehrkraft kann nur gelöscht werden, wenn keine Termine mehr existieren.`)) {
      return;
    }

    try {
      await api.admin.deleteTeacher(id);
      await loadTeachers();
      alert(`Lehrkraft "${name}" wurde erfolgreich gelöscht.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTeacher(null);
    setFormData({ name: '', system: 'dual', room: '' });
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
        <p>Lade Lehrkräfte...</p>
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
              <div className="form-group">
                <label htmlFor="room">Raum</label>
                <input
                  id="room"
                  type="text"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  placeholder="z.B. Raum 101"
                />
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
                  <th>System</th>
                  <th>Sprechstunde</th>
                  <th>Raum</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td>{teacher.id}</td>
                    <td className="teacher-name">{teacher.name}</td>
                    <td>{teacher.system === 'vollzeit' ? 'Vollzeit' : 'Dual'}</td>
                    <td>{teacher.system === 'vollzeit' ? '17:00 - 19:00 Uhr' : '16:00 - 18:00 Uhr'}</td>
                    <td>{teacher.room || '-'}</td>
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
