import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { UserAccount } from '../types';
import './AdminDashboard.css';

export function AdminUsers() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'teacher'>('all');
  const [savingById, setSavingById] = useState<Record<number, boolean>>({});

  const { user, setActiveView } = useAuth();

  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  useEffect(() => {
    if (canSwitchView) setActiveView('admin');
  }, [canSwitchView, setActiveView]);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.admin.getUsers();
      setUsers((data || []) as UserAccount[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Benutzer');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') {
      setLoading(false);
      return;
    }
    loadUsers();
  }, [loadUsers, user?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const username = String(u.username || '').toLowerCase();
      const role = String(u.role || '').toLowerCase();
      const teacherId = u.teacher_id != null ? String(u.teacher_id) : '';
      return username.includes(q) || role.includes(q) || teacherId.includes(q);
    });
  }, [search, users]);

  const visible = useMemo(() => {
    if (roleFilter === 'all') return filtered;
    return filtered.filter((u) => u.role === roleFilter);
  }, [filtered, roleFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const teacherCount = users.filter((u) => u.role === 'teacher').length;
    return { total, adminCount, teacherCount };
  }, [users]);

  const updateRole = async (target: UserAccount, nextRole: 'admin' | 'teacher') => {
    const currentRole = target.role;
    if (currentRole === nextRole) return;

    const isSelf = !!user?.username && target.username === user.username;
    if (isSelf && nextRole !== 'admin') {
      alert('Du kannst deine eigenen Adminrechte nicht entfernen.');
      return;
    }

    const prompt = nextRole === 'admin'
      ? `Soll „${target.username}“ Adminrechte bekommen?`
      : `Soll „${target.username}“ die Adminrechte verlieren?`;

    if (!confirm(prompt)) return;

    setSavingById((prev) => ({ ...prev, [target.id]: true }));
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: nextRole } : u)));

    try {
      const updated = await api.admin.updateUserRole(target.id, nextRole);
      if (updated) {
        setUsers((prev) => prev.map((u) => (u.id === target.id ? (updated as UserAccount) : u)));
      } else {
        await loadUsers();
      }

      setFlash('Änderung gespeichert. Hinweis: Rollenwechsel wird erst nach erneutem Login wirksam.');
      window.setTimeout(() => setFlash(''), 6500);
    } catch (e) {
      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: currentRole } : u)));
      alert(e instanceof Error ? e.message : 'Fehler beim Aktualisieren der Rolle');
    } finally {
      setSavingById((prev) => ({ ...prev, [target.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner"></div>
        <p>Lade Benutzer…</p>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="admin-dashboard">
        <main className="admin-main">
          <div className="admin-error">Keine Berechtigung: Adminrechte erforderlich.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <main className="admin-main">
        <div className="admin-success">
          Hinweis: Rollenwechsel wirken erst nach erneutem Login (der JWT enthält die Rolle).
        </div>

        {flash && <div className="admin-success">{flash}</div>}

        <div className="teacher-form-container">
          <div className="admin-section-header">
            <h3>Benutzer & Rechte verwalten</h3>
            <div className="admin-users-header-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={loadUsers}
              >
                Aktualisieren
              </button>
            </div>
          </div>

          {error && <div className="admin-error">{error}</div>}

          <div className="admin-users-toolbar">
            <div className="admin-users-stats" aria-label="Benutzerstatistik">
              <div className="admin-users-stat">
                <div className="admin-users-stat__label">Gesamt</div>
                <div className="admin-users-stat__value">{stats.total}</div>
              </div>
              <div className="admin-users-stat">
                <div className="admin-users-stat__label">Admins</div>
                <div className="admin-users-stat__value">{stats.adminCount}</div>
              </div>
              <div className="admin-users-stat">
                <div className="admin-users-stat__label">Lehrkräfte</div>
                <div className="admin-users-stat__value">{stats.teacherCount}</div>
              </div>
            </div>

            <div className="admin-users-controls">
              <div className="admin-teacher-search" style={{ marginBottom: 0 }}>
                <label htmlFor="adminUserSearch" className="admin-teacher-search-label">
                  Suche
                </label>
                <div className="admin-teacher-search-row">
                  <input
                    id="adminUserSearch"
                    className="admin-teacher-search-input"
                    type="text"
                    placeholder="Username, Rolle oder Lehrkraft-ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="admin-users-filter">
                <label htmlFor="adminUserRoleFilter" className="admin-teacher-search-label">
                  Filter
                </label>
                <select
                  id="adminUserRoleFilter"
                  className="admin-table-select"
                  value={roleFilter}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'all' || v === 'admin' || v === 'teacher') {
                      setRoleFilter(v);
                    }
                  }}
                >
                  <option value="all">Alle Rollen</option>
                  <option value="admin">Admins</option>
                  <option value="teacher">Lehrkräfte</option>
                </select>
              </div>
            </div>
          </div>

          <div className="admin-resp-table-container">
            <table className="admin-resp-table">
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Benutzer</th>
                <th>Rolle</th>
                <th>Lehrkraft-ID</th>
                <th>Erstellt</th>
                <th className="admin-actions-header">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: '#555' }}>
                    Keine Benutzer gefunden.
                  </td>
                </tr>
              ) : (
                visible.map((u) => {
                  const saving = !!savingById[u.id];
                  const isAdmin = u.role === 'admin';
                  const isSelf = !!user?.username && u.username === user.username;

                  return (
                    <tr key={u.id} className={isSelf ? 'admin-users-row--self' : undefined}>
                      <td data-label="Benutzer">
                        <div className="admin-users-username">
                          <span className="admin-cell-main">{u.username}</span>
                          {isSelf && <span className="admin-users-badge" title="Das bist du">Du</span>}
                        </div>
                      </td>
                      <td data-label="Rolle">
                        <span className={isAdmin ? 'admin-role-pill admin-role-pill--admin' : 'admin-role-pill admin-role-pill--teacher'}>
                          {isAdmin ? 'Admin' : 'Lehrkraft'}
                        </span>
                      </td>
                      <td data-label="Lehrkraft-ID">{u.teacher_id ?? '—'}</td>
                      <td data-label="Erstellt">{u.created_at ? new Date(u.created_at).toLocaleString('de-DE') : '—'}</td>
                      <td data-label="Aktion" className="admin-actions-cell">
                        <div className="admin-users-action">
                          <select
                            className="admin-table-select"
                            value={u.role === 'admin' ? 'admin' : 'teacher'}
                            disabled={saving || (isSelf && u.role === 'admin')}
                            onChange={(e) => updateRole(u, e.target.value === 'admin' ? 'admin' : 'teacher')}
                            aria-label={`Rolle für ${u.username}`}
                            title={isSelf && u.role === 'admin' ? 'Eigene Adminrolle kann nicht entfernt werden.' : 'Rolle ändern'}
                          >
                            <option value="teacher">Lehrkraft</option>
                            <option value="admin">Admin</option>
                          </select>
                          {saving && <span className="admin-users-saving">Speichert…</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      </main>
    </div>
  );
}
