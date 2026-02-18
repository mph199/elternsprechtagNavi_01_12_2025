import { useEffect, useState } from 'react';
import api from '../../services/api';
import type { BookingRequest } from '../../types';
import { TeacherRequestsTableSandbox } from '../../components/TeacherRequestsTableSandbox';

export function TeacherRequests() {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string>('');
  const [selectedAssignTimes, setSelectedAssignTimes] = useState<Record<number, string>>({});
  const [teacherMessages, setTeacherMessages] = useState<Record<number, string>>({});

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.teacher.getRequests();
      setRequests(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Anfragen');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleDeclineRequest = async (requestId: number) => {
    setError('');
    setNotice('');
    if (!confirm('Möchten Sie diese Anfrage wirklich ablehnen?')) return;
    try {
      await api.teacher.declineRequest(requestId);
      await loadRequests();
      setNotice('Anfrage abgelehnt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Ablehnen');
    }
  };

  const handleAcceptRequest = async (requestId: number, assignedTime?: string) => {
    setError('');
    setNotice('');
    try {
      const teacherMessage = teacherMessages[requestId]?.trim();
      await api.teacher.acceptRequest(requestId, {
        ...(assignedTime ? { time: assignedTime } : {}),
        ...(teacherMessage ? { teacherMessage } : {}),
      });
      await loadRequests();
      setNotice('Anfrage angenommen und Termin vergeben.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Annehmen');
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="spinner" />
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <>
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
        <div className="stat-card" style={{ flex: '1 1 280px', minWidth: 240, padding: '1.1rem 1.1rem' }}>
          <h3>Offene Anfragen</h3>
          <p className="stat-number">{requests.length}</p>
          <p className="stat-label">zur Bearbeitung</p>
        </div>
      </div>

      <section className="stat-card teacher-table-section" style={{ padding: '1.1rem 1.1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Anfragen verwalten</h3>
          <button type="button" className="btn-secondary" onClick={loadRequests}>
            Aktualisieren
          </button>
        </div>

        <TeacherRequestsTableSandbox
          requests={requests}
          selectedAssignTimes={selectedAssignTimes}
          teacherMessages={teacherMessages}
          onAssignTimeChange={(requestId, value) => {
            setSelectedAssignTimes((prev) => ({ ...prev, [requestId]: value }));
          }}
          onTeacherMessageChange={(requestId, value) => {
            setTeacherMessages((prev) => ({ ...prev, [requestId]: value }));
          }}
          onAcceptRequest={handleAcceptRequest}
          onDeclineRequest={handleDeclineRequest}
        />
      </section>
    </>
  );
}
