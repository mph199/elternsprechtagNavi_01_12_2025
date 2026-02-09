import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/useAuth';
import api from '../services/api';
import type { TimeSlot as ApiSlot, Teacher as ApiTeacher } from '../types';
import { exportTeacherSlotsToICal } from '../utils/icalExport';
import { teacherDisplayName, teacherGroupKey } from '../utils/teacherDisplayName';
import './AdminDashboard.css';

export function AdminSlots() {
  const [teachers, setTeachers] = useState<ApiTeacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null);
  const [slots, setSlots] = useState<ApiSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ApiSlot | null>(null);
  const [formData, setFormData] = useState({ time: '', date: '' });
  const [bulkCreating, setBulkCreating] = useState(false);
  const { user, setActiveView } = useAuth();

  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  useEffect(() => {
    if (canSwitchView) setActiveView('admin');
  }, [canSwitchView, setActiveView]);

  const loadTeachers = useCallback(async () => {
    try {
      const data = await api.getTeachers();
      setTeachers(data);
      if (data.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Lehrkräfte');
    }
  }, [selectedTeacherId]);

  const loadSlots = async (teacherId: number) => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getSlots(teacherId);
      setSlots(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Slots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    if (selectedTeacherId) {
      loadSlots(selectedTeacherId);
    }
  }, [selectedTeacherId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.time.trim() || !formData.date) {
      alert('Bitte alle Felder ausfüllen');
      return;
    }

    if (!selectedTeacherId) {
      alert('Bitte wählen Sie eine Lehrkraft aus');
      return;
    }

    try {
      if (editingSlot) {
        await api.admin.updateSlot(editingSlot.id, formData);
      } else {
        await api.admin.createSlot({
          teacher_id: selectedTeacherId,
          ...formData,
        });
      }
      await loadSlots(selectedTeacherId);
      setShowForm(false);
      setEditingSlot(null);
      setFormData({ time: '', date: '' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern');
    }
  };

  const handleEdit = (slot: ApiSlot) => {
    setEditingSlot(slot);
    setFormData({
      time: slot.time,
      date: slot.date,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number, time: string) => {
    if (!confirm(`Möchten Sie den Slot "${time}" wirklich löschen?`)) {
      return;
    }

    try {
      await api.admin.deleteSlot(id);
      if (selectedTeacherId) {
        await loadSlots(selectedTeacherId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Löschen');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingSlot(null);
    setFormData({ time: '', date: '' });
  };

  const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);

  return (
    <div className="admin-dashboard">
      <main className="admin-main">
        <div className="admin-section-header">
          <h2>Zeitslots verwalten</h2>
          {selectedTeacherId && !showForm && (
            <div className="action-buttons action-buttons--compact">
              <button 
                onClick={() => setShowForm(true)} 
                className="btn-primary"
              >
                + Neuer Slot
              </button>
              <button
                onClick={async () => {
                  if (!selectedTeacherId) return;
                  const name = selectedTeacher ? teacherDisplayName(selectedTeacher) : 'diese Lehrkraft';
                  if (!confirm(`Alle Slots für ${name} anlegen?`)) return;
                  try {
                    setBulkCreating(true);
                    const res = await api.admin.generateTeacherSlots(selectedTeacherId);
                    type GenerateSlotsResponse = { created?: number; skipped?: number; eventDate?: string | null };
                    const parsed = res as unknown as GenerateSlotsResponse;
                    const created = parsed?.created ?? 0;
                    const skipped = parsed?.skipped ?? 0;
                    const eventDate = parsed?.eventDate ?? null;
                    await loadSlots(selectedTeacherId);
                    alert(`Slots angelegt${eventDate ? ` (${eventDate})` : ''}: ${created}\nBereits vorhanden: ${skipped}`);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Fehler beim Anlegen der Slots');
                  } finally {
                    setBulkCreating(false);
                  }
                }}
                className="btn-secondary"
                disabled={bulkCreating}
              >
                {bulkCreating ? 'Anlegen…' : 'Alle Slots anlegen'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="teacher-select">Lehrkraft auswählen</label>
          <select
            id="teacher-select"
            value={selectedTeacherId || ''}
            onChange={(e) => setSelectedTeacherId(parseInt(e.target.value))}
            style={{ 
              padding: '0.65rem', 
              borderRadius: '8px', 
              border: '2px solid #e5e7eb',
              fontSize: '1rem',
              width: '100%',
              maxWidth: '400px'
            }}
          >
              {(() => {
                const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
                const sorted = [...teachers].sort((l, r) => collator.compare(teacherDisplayName(l), teacherDisplayName(r)));
                const groups = new Map<string, typeof sorted>();
                for (const t of sorted) {
                  const key = teacherGroupKey(t);
                  const list = groups.get(key);
                  if (list) list.push(t);
                  else groups.set(key, [t]);
                }

                const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
                return entries.map(([key, list]) => (
                  <optgroup key={`tg-${key}`} label={key}>
                    {list.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacherDisplayName(teacher)} - {teacher.system === 'vollzeit' ? 'Vollzeit' : 'Dual'}
                      </option>
                    ))}
                  </optgroup>
                ));
              })()}
          </select>
        </div>

        {showForm && (
          <div className="teacher-form-container">
            <h3>{editingSlot ? 'Slot bearbeiten' : 'Neuen Slot anlegen'}</h3>
            <form onSubmit={handleSubmit} className="teacher-form">
              <div className="form-group">
                <label htmlFor="time">Zeit</label>
                <input
                  id="time"
                  type="text"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  placeholder="z.B. 16:00 - 16:15"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="date">Datum</label>
                <input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingSlot ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="admin-loading">
            <div className="spinner"></div>
            <p>Laden...</p>
          </div>
        ) : (
          <>
            {selectedTeacher && (
              <div className="settings-info" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3>Slots für {teacherDisplayName(selectedTeacher)}</h3>
                    <p>System: {selectedTeacher.system === 'vollzeit' ? 'Vollzeit (17:00 - 19:00)' : 'Dual (16:00 - 18:00)'}</p>
                    <p>Anzahl Slots: {slots.length} ({slots.filter(s => s.booked).length} gebucht)</p>
                  </div>
                  {slots.filter(s => s.booked).length > 0 && (
                    <button
                      onClick={() => exportTeacherSlotsToICal(slots, teacherDisplayName(selectedTeacher), selectedTeacher.room)}
                      className="btn-primary"
                    >
                      📅 Termine exportieren
                    </button>
                  )}
                </div>
              </div>
            )}

            {slots.length === 0 ? (
              <div className="no-teachers">
                <p>Keine Slots vorhanden.</p>
              </div>
            ) : (
              <div className="teachers-table-container">
                <table className="bookings-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Zeit</th>
                      <th>Datum</th>
                      <th>Status</th>
                      <th>Gebucht von</th>
                      <th>Vertreter*in</th>
                      <th>Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((slot) => (
                      <tr key={slot.id}>
                        <td>{slot.id}</td>
                        <td>{slot.time}</td>
                        <td>{slot.date}</td>
                        <td>
                          <span className={`status-badge ${slot.booked ? 'booked-status' : 'available-status'}`}>
                            {slot.booked ? 'Gebucht' : 'Verfügbar'}
                          </span>
                        </td>
                        <td>
                          {slot.booked ? (
                            <div>
                              {slot.visitorType === 'parent' ? (
                                <>
                                  <div>{slot.parentName}</div>
                                  <small>{slot.studentName} ({slot.className})</small>
                                </>
                              ) : (
                                <>
                                  <div>{slot.companyName}</div>
                                  <small>{slot.traineeName} ({slot.className})</small>
                                </>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>
                          {slot.booked && slot.visitorType === 'company' ? (slot.representativeName || '-') : '-'}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => handleEdit(slot)}
                              className="edit-button"
                              disabled={slot.booked}
                            >
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => handleDelete(slot.id, slot.time)}
                              className="cancel-button"
                              disabled={slot.booked}
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
          </>
        )}
      </main>
    </div>
  );
}
