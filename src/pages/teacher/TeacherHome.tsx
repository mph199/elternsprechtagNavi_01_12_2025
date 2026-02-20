import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import type { BookingRequest, TimeSlot } from '../../types';
import './TeacherHome.css';

export function TeacherHome() {
  const navigate = useNavigate();

  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [bookings, setBookings] = useState<TimeSlot[]>([]);
  const [activeEventLabel, setActiveEventLabel] = useState('3. März');
  const [upcomingEventDates, setUpcomingEventDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const openRequestsCount = requests.length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;

  const formatEventDateLabel = (isoDate: string) => {
    const parsed = new Date(String(isoDate || ''));
    if (Number.isNaN(parsed.getTime())) return '3. März';
    return new Intl.DateTimeFormat('de-DE', {
      day: 'numeric',
      month: 'long',
    }).format(parsed);
  };

  const formatEventLongLabel = (isoDate: string) => {
    const parsed = new Date(String(isoDate || ''));
    if (Number.isNaN(parsed.getTime())) return 'Termin folgt';
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(parsed);
  };

  type ActiveEventsResponse = { event?: { starts_at?: string } | null };
  type UpcomingEventsResponse = { events?: Array<{ starts_at?: string }> };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [requestsData, bookingsData] = await Promise.all([
          api.teacher.getRequests(),
          api.teacher.getBookings(),
        ]);
        const [activeRes, upcomingRes] = (await Promise.all([
          api.events.getActive(),
          api.events.getUpcoming(),
        ])) as [ActiveEventsResponse, UpcomingEventsResponse];
        if (!active) return;
        setRequests(requestsData || []);
        setBookings(bookingsData || []);
        const activeStartsAt = activeRes?.event?.starts_at || '';
        const activeLabel = formatEventDateLabel(activeStartsAt);
        setActiveEventLabel(activeLabel);
        setUpcomingEventDates(
          (upcomingRes?.events || [])
            .map((event) => String(event?.starts_at || ''))
            .filter(Boolean)
            .filter((value) => !activeStartsAt || formatEventDateLabel(value) !== activeLabel)
        );
      } catch {
        if (!active) return;
        setError('Daten konnten nicht geladen werden.');
        setRequests([]);
        setBookings([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="teacher-home">
      <section className="teacher-home__hero" aria-label="Startseite Lehrkräfte">
        <div className="teacher-home__hero-layout">
          <div className="teacher-home__hero-main">
            <p className="teacher-home__welcome">Willkommen auf der Startseite der Ansicht für Lehrkräfte.</p>
            <p className="teacher-home__hero-subline">Hier sehen Sie offene Anfragen, die nächsten Termine und aktuelle Benachrichtigungen auf einen Blick.</p>
          </div>

          <aside className="teacher-home__next-card" aria-label="Nächste Termine">
            <p className="teacher-home__next-title">
              <span className="teacher-home__next-icon" aria-hidden="true">📅</span>
              Nächste Termine
            </p>
            <div className="teacher-home__active-event" aria-label="Aktiver Sprechtag">
              <span className="teacher-home__active-dot" aria-hidden="true" />
              <span>Eltern- und Ausbildersprechtag – {activeEventLabel}</span>
            </div>
            {upcomingEventDates.length > 0 ? (
              <ul className="teacher-home__next-list" role="list">
                {upcomingEventDates.map((date, index) => (
                  <li key={`${date}-${index}`} className="teacher-home__next-item">
                    Eltern- und Ausbildersprechtag – {formatEventLongLabel(date)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="teacher-home__next-empty">Derzeit sind keine weiteren Termine geplant.</p>
            )}
          </aside>
        </div>
      </section>

      {error && <div className="admin-error" style={{ marginBottom: 14 }}>{error}</div>}

      <section className="teacher-home__stats" aria-label="Kennzahlen">
        <article className="teacher-home__stat-card is-open" role="button" tabIndex={0} onClick={() => navigate('/teacher/requests')} onKeyDown={(e) => e.key === 'Enter' && navigate('/teacher/requests')}>
          <span className="teacher-home__stat-label">Offene Anfragen</span>
          <strong className="teacher-home__stat-value">{loading ? '…' : openRequestsCount}</strong>
          <span className="teacher-home__badge">Offen</span>
        </article>
        <article className="teacher-home__stat-card" role="button" tabIndex={0} onClick={() => navigate('/teacher/bookings')} onKeyDown={(e) => e.key === 'Enter' && navigate('/teacher/bookings')}>
          <span className="teacher-home__stat-label">Bestätigte Termine</span>
          <strong className="teacher-home__stat-value">{loading ? '…' : confirmedCount}</strong>
        </article>
      </section>

      <section className="teacher-home__notifications" aria-label="Benachrichtigungen">
        <h3 className="teacher-home__panel-title teacher-home__panel-title--with-icon">
          <svg
            className="teacher-home__panel-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M15 17H9M18 17V11C18 7.68629 15.3137 5 12 5C8.68629 5 6 7.68629 6 11V17L4 19H20L18 17Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 19C10 20.1046 10.8954 21 12 21C13.1046 21 14 20.1046 14 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Benachrichtigungen</span>
        </h3>
        <div className="teacher-home__action-list">
          <button className="teacher-home__action-row" type="button" onClick={() => navigate('/teacher/requests')}>
            <span className="teacher-home__action-dot is-red" aria-hidden="true" />
            <span>{openRequestsCount} Anfragen warten auf Terminzuweisung</span>
          </button>
          <button className="teacher-home__action-row" type="button" onClick={() => navigate('/teacher/bookings')}>
            <span className="teacher-home__action-dot is-green" aria-hidden="true" />
            <span>{confirmedCount} Termine sind bereits bestätigt</span>
          </button>
        </div>
      </section>
    </div>
  );
}
