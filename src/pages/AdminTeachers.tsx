import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { Teacher as ApiTeacher } from '../types';
import './AdminDashboard.css';
import { Breadcrumbs } from '../components/Breadcrumbs';

type TeacherLoginResponse = {
  user?: {
    username: string;
    tempPassword: string;
  };
};

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<ApiTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<ApiTeacher | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', salutation: 'Herr' as 'Herr' | 'Frau' | 'Divers', system: 'dual' as 'dual' | 'vollzeit', room: '', username: '', password: '' });
  const [createdCreds, setCreatedCreds] = useState<{ username: string; tempPassword: string } | null>(null);
  const [systemSaving, setSystemSaving] = useState<Record<number, boolean>>({});
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const loadTeachers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.admin.getTeachers();
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
    
    if (!formData.name.trim() || !formData.email.trim() || !formData.salutation) {
      alert('Bitte Name, Anrede und E-Mail ausfüllen');
      return;
    }

    const normalizedEmail = formData.email.trim().toLowerCase();
    const isValidEmail = /^[a-z0-9._%+-]+@bksb\.nrw$/i.test(normalizedEmail);
    if (!isValidEmail) {
      alert('Die E-Mail-Adresse muss auf @bksb.nrw enden.');
      return;
    }

    try {
      const teacherData = {
        name: formData.name,
        email: normalizedEmail,
        salutation: formData.salutation,
        subject: 'Sprechstunde',
        system: formData.system,
        room: formData.room,
        username: formData.username || undefined,
        password: formData.password || undefined,
      };
      
      if (editingTeacher) {
        await api.admin.updateTeacher(editingTeacher.id, teacherData);
      } else {
        const res = await api.admin.createTeacher(teacherData);
        const typed = res as TeacherLoginResponse;
        if (typed?.user) {
          setCreatedCreds({ username: typed.user.username, tempPassword: typed.user.tempPassword });
        }
      }
      await loadTeachers();
      setShowForm(false);
      setEditingTeacher(null);
      setFormData({ name: '', email: '', salutation: 'Herr', system: 'dual', room: '', username: '', password: '' });
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const handleEdit = (teacher: ApiTeacher) => {
    setEditingTeacher(teacher);
    setFormData({
      name: teacher.name,
      email: teacher.email || '',
      salutation: (teacher.salutation || 'Herr') as 'Herr' | 'Frau' | 'Divers',
      system: teacher.system || 'dual', // Fallback falls system undefined ist
      room: teacher.room || '',
      username: '',
      password: '',
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
    setFormData({ name: '', email: '', salutation: 'Herr', system: 'dual', room: '', username: '', password: '' });
  };

  const handleInlineSystemChange = async (teacher: ApiTeacher, nextSystem: 'dual' | 'vollzeit') => {
    const currentSystem: 'dual' | 'vollzeit' = teacher.system || 'dual';
    if (currentSystem === nextSystem) return;

    // Backend update requires these fields; if missing, fall back to edit form.
    if (!teacher.email || !teacher.salutation) {
      alert('Bitte erst über "Bearbeiten" E-Mail und Anrede setzen, bevor das System geändert werden kann.');
      return;
    }

    setSystemSaving((prev) => ({ ...prev, [teacher.id]: true }));
    setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, system: nextSystem } : t)));

    try {
      await api.admin.updateTeacher(teacher.id, {
        name: teacher.name,
        email: teacher.email,
        salutation: teacher.salutation,
        subject: teacher.subject || 'Sprechstunde',
        system: nextSystem,
        room: teacher.room || '',
      });
    } catch (err) {
      // Revert optimistic update
      setTeachers((prev) => prev.map((t) => (t.id === teacher.id ? { ...t, system: currentSystem } : t)));
      alert(err instanceof Error ? err.message : 'Fehler beim Aktualisieren des Systems');
    } finally {
      setSystemSaving((prev) => ({ ...prev, [teacher.id]: false }));
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

        {!showForm && (
          <div className="admin-teacher-search">
            <label htmlFor="teacherAdminSearch" className="admin-teacher-search-label">
              Suche
            </label>
            <div className="admin-teacher-search-row">
              <input
                id="teacherAdminSearch"
                className="admin-teacher-search-input"
                type="text"
                placeholder="Name, E-Mail oder Raum…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="btn-secondary btn-secondary--sm"
                  onClick={() => setSearch('')}
                >
                  Löschen
                </button>
              )}
            </div>
          </div>
        )}

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
                <label htmlFor="salutation">Anrede</label>
                <select
                  id="salutation"
                  value={formData.salutation}
                  onChange={(e) => setFormData({ ...formData, salutation: e.target.value as 'Herr' | 'Frau' | 'Divers' })}
                  required
                >
                  <option value="Herr">Herr</option>
                  <option value="Frau">Frau</option>
                  <option value="Divers">Divers</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="email">E-Mail (muss auf @bksb.nrw enden)</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="z.B. vorname.nachname@bksb.nrw"
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
              {!editingTeacher && (
                <>
                  <div className="form-group">
                    <label htmlFor="username">Benutzername (optional)</label>
                    <input
                      id="username"
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="z.B. herrhuhn"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="password">Passwort (optional, min. 8 Zeichen)</label>
                    <input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="z.B. sicherespasswort"
                    />
                  </div>
                </>
              )}
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingTeacher ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </form>
            {!editingTeacher && createdCreds && (
              <div className="admin-success" style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Login für Lehrkraft erstellt</div>
                <div><strong>Benutzername:</strong> {createdCreds.username}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span><strong>Temporäres Passwort:</strong> {createdCreds.tempPassword}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(createdCreds.tempPassword);
                        alert('Passwort kopiert');
                      } catch {
                        // ignore
                      }
                    }}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                  >
                    Kopieren
                  </button>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  Bitte sicher weitergeben und nach dem ersten Login ändern.
                </div>
              </div>
            )}
          </div>
        )}

        {teachers.filter((t) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          const name = (t.name || '').toLowerCase();
          const email = (t.email || '').toLowerCase();
          const room = (t.room || '').toLowerCase();
          return name.includes(q) || email.includes(q) || room.includes(q);
        }).length === 0 ? (
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
                  <th>Anrede</th>
                  <th>E-Mail</th>
                  <th>System</th>
                  <th>Sprechstunde</th>
                  <th>Raum</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {teachers
                  .filter((t) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    const name = (t.name || '').toLowerCase();
                    const email = (t.email || '').toLowerCase();
                    const room = (t.room || '').toLowerCase();
                    return name.includes(q) || email.includes(q) || room.includes(q);
                  })
                  .map((teacher) => (
                  <tr key={teacher.id}>
                    <td>{teacher.id}</td>
                    <td className="teacher-name">{teacher.name}</td>
                    <td>{teacher.salutation || '-'}</td>
                    <td>{teacher.email || '-'}</td>
                    <td>
                      <select
                        className="admin-table-select"
                        value={(teacher.system || 'dual') as 'dual' | 'vollzeit'}
                        onChange={(e) => handleInlineSystemChange(teacher, e.target.value as 'dual' | 'vollzeit')}
                        disabled={!!systemSaving[teacher.id]}
                        aria-label={`System für ${teacher.name}`}
                        title={systemSaving[teacher.id] ? 'Speichere…' : undefined}
                      >
                        <option value="dual">Dual</option>
                        <option value="vollzeit">Vollzeit</option>
                      </select>
                    </td>
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
                        <button
                          onClick={async () => {
                            try {
                              const res = await api.admin.resetTeacherLogin(teacher.id);
                              const typed = res as TeacherLoginResponse;
                              if (typed?.user) {
                                alert(`Login zurückgesetzt\n\nBenutzername: ${typed.user.username}\nTemporäres Passwort: ${typed.user.tempPassword}`);
                              } else {
                                alert('Login zurückgesetzt.');
                              }
                            } catch (err) {
                              alert(err instanceof Error ? err.message : 'Fehler beim Zurücksetzen des Logins');
                            }
                          }}
                          className="edit-button"
                        >
                          Login zurücksetzen
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
