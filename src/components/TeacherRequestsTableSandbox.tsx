import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingRequest } from '../types';
import './TeacherRequestsTableSandbox.css';

function buildAssignableQuarterHourSlots(timeWindow: string): string[] {
  const m = String(timeWindow || '').trim().match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (!m) return [];

  const start = Number.parseInt(m[1], 10) * 60 + Number.parseInt(m[2], 10);
  const end = Number.parseInt(m[3], 10) * 60 + Number.parseInt(m[4], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const fmt = (mins: number) => {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const result: string[] = [];
  for (let t = start; t + 15 <= end; t += 15) {
    result.push(`${fmt(t)} - ${fmt(t + 15)}`);
  }
  return result;
}

function parseTimeWindowToMinutes(timeWindow: string): { start: number; end: number } | null {
  const raw = String(timeWindow || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/[–—]/g, '-');

  const rangeMatch = normalized.match(/^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/);
  if (rangeMatch) {
    const start = Number.parseInt(rangeMatch[1], 10) * 60 + Number.parseInt(rangeMatch[2], 10);
    const end = Number.parseInt(rangeMatch[3], 10) * 60 + Number.parseInt(rangeMatch[4], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end };
  }

  const pointMatch = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!pointMatch) return null;

  const start = Number.parseInt(pointMatch[1], 10) * 60 + Number.parseInt(pointMatch[2], 10);
  if (!Number.isFinite(start)) return null;
  return { start, end: start + 15 };
}

function splitTimesByRequestedWindow(times: string[], requestedWindow: string) {
  const requested = parseTimeWindowToMinutes(requestedWindow);
  if (!requested) {
    return { inside: times, outside: [] as string[] };
  }

  const inside: string[] = [];
  const outside: string[] = [];

  for (const time of times) {
    const parsed = parseTimeWindowToMinutes(time);
    if (!parsed) {
      outside.push(time);
      continue;
    }

    if (parsed.start >= requested.start && parsed.end <= requested.end) {
      inside.push(time);
    } else {
      outside.push(time);
    }
  }

  return { inside, outside };
}

function getAssignableTimes(request: BookingRequest): string[] {
  if (Array.isArray(request.availableTimes) && request.availableTimes.length > 0) {
    return request.availableTimes.filter((value) => typeof value === 'string' && value.trim().length > 0);
  }
  if (Array.isArray(request.assignableTimes)) {
    return request.assignableTimes.filter((value) => typeof value === 'string' && value.trim().length > 0);
  }
  return buildAssignableQuarterHourSlots(request.requestedTime);
}

function formatCreatedAt(createdAt?: string): string {
  if (!createdAt) return '-';
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return createdAt;

  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return 'gerade eben';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

type TeacherRequestsTableSandboxProps = {
  requests: BookingRequest[];
  selectedAssignTimes: Record<number, string>;
  teacherMessages: Record<number, string>;
  onAssignTimeChange: (requestId: number, value: string) => void;
  onTeacherMessageChange: (requestId: number, value: string) => void;
  onAcceptRequest: (requestId: number, assignedTime?: string) => void;
  onDeclineRequest: (requestId: number) => void;
};

export function TeacherRequestsTableSandbox({
  requests,
  selectedAssignTimes,
  teacherMessages,
  onAssignTimeChange,
  onTeacherMessageChange,
  onAcceptRequest,
  onDeclineRequest,
}: TeacherRequestsTableSandboxProps) {
  const CAROUSEL_INDEX_STORAGE_KEY = 'teacher-requests-carousel-active-index';
  const CARD_ACCENT_CLASSES = ['is-accent-1', 'is-accent-2', 'is-accent-3', 'is-accent-4'];

  const carouselRef = useRef<HTMLDivElement | null>(null);
  /** true while the user is physically swiping / dragging / wheeling */
  const userDraggingRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.sessionStorage.getItem(CAROUSEL_INDEX_STORAGE_KEY);
    const parsed = Number.parseInt(String(raw || ''), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  });
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<number, boolean>>({});

  const total = requests.length;
  const safeActiveIndex = total > 0 ? Math.min(activeIndex, total - 1) : 0;

  /* ── helpers ──────────────────────────────────────────────── */

  const getSlides = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return [] as HTMLElement[];
    return Array.from(el.querySelectorAll<HTMLElement>('.sandbox-slide'));
  }, []);

  /** Index of the slide whose center is nearest the viewport center */
  const getNearestIndex = useCallback(() => {
    const el = carouselRef.current;
    const slides = getSlides();
    if (!el || !slides.length) return 0;

    const viewportCenter = el.scrollLeft + el.clientWidth / 2;
    let bestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, [getSlides]);

  /* ── scroll handling ─────────────────────────────────────── */

  /**
   * onScroll: update activeIndex ONLY while the user is physically
   * dragging / swiping. Button-driven scrolls never set this flag,
   * so their scroll events are completely ignored.
   */
  const handleCarouselScroll = useCallback(() => {
    if (!userDraggingRef.current) return;
    const nearest = getNearestIndex();
    setActiveIndex((prev) => (prev === nearest ? prev : nearest));
  }, [getNearestIndex]);

  /**
   * Navigate to a specific slide via button / dot click.
   * Sets activeIndex immediately. The resulting scroll events
   * are ignored because userDraggingRef is false.
   */
  const scrollToIndex = useCallback((nextIndex: number) => {
    const el = carouselRef.current;
    if (!el || !total) return;
    const clamped = Math.max(0, Math.min(total - 1, nextIndex));

    // Instant visual update
    setActiveIndex(clamped);

    // Scroll the target slide into view – CSS snap handles exact centering
    const slides = getSlides();
    const targetSlide = slides[clamped];
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [total, getSlides]);

  /**
   * User starts a physical interaction on the carousel.
   * Mark dragging so scroll events will track position.
   */
  const handleDragStart = useCallback(() => {
    userDraggingRef.current = true;
  }, []);

  /* ── effects ────────────────────────────────────────────── */

  /**
   * scrollend on the carousel: finalize activeIndex after a user swipe
   * snap completes. Only acts when the user was physically dragging.
   * Button-driven scrolls are excluded — their activeIndex is already set.
   */
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const onScrollEnd = () => {
      if (!userDraggingRef.current) return;
      userDraggingRef.current = false;
      const nearest = getNearestIndex();
      setActiveIndex((prev) => (prev === nearest ? prev : nearest));
    };

    el.addEventListener('scrollend', onScrollEnd);
    return () => el.removeEventListener('scrollend', onScrollEnd);
  }, [getNearestIndex]);

  /** On mount / data change: clamp index and center the active slide */
  useEffect(() => {
    if (!total) return;
    const el = carouselRef.current;
    if (!el) return;

    const clamped = Math.min(activeIndex, total - 1);
    if (clamped !== activeIndex) setActiveIndex(clamped);

    // Use scrollIntoView for centering so CSS snap stays consistent
    requestAnimationFrame(() => {
      const slides = getSlides();
      const targetSlide = slides[clamped];
      if (targetSlide) {
        targetSlide.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
    });
    // Intentionally only triggered by total (data load / card removal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  /** Re-center current slide on window resize */
  useEffect(() => {
    const onResize = () => {
      const el = carouselRef.current;
      if (!el || !total) return;
      requestAnimationFrame(() => {
        const slides = getSlides();
        const targetSlide = slides[safeActiveIndex];
        if (targetSlide) {
          targetSlide.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [getSlides, safeActiveIndex, total]);

  /** Persist active index to sessionStorage */
  useEffect(() => {
    window.sessionStorage.setItem(CAROUSEL_INDEX_STORAGE_KEY, String(safeActiveIndex));
  }, [safeActiveIndex]);

  return (
    <section className="sandbox-table" aria-label="Anfragen-Kartenansicht">
      <div className="sandbox-table__views">
      {total > 0 && (
        <p className="sandbox-carousel-progress">
          Anfrage {Math.min(safeActiveIndex + 1, total)} von {total}
        </p>
      )}

      <div className="sandbox-carousel-frame" aria-label="Karten-Navigation">
        {total > 0 && (
          <button
            type="button"
            className="sandbox-nav-btn sandbox-nav-arrow"
            aria-label="Vorherige Anfrage"
            onClick={() => scrollToIndex(safeActiveIndex - 1)}
            disabled={safeActiveIndex <= 0}
          >
            {'<'}
          </button>
        )}

        <div
          ref={carouselRef}
          className="sandbox-carousel"
          aria-label="Kartenansicht der Anfragen"
          onPointerDown={handleDragStart}
          onTouchStart={handleDragStart}
          onWheel={handleDragStart}
          onScroll={handleCarouselScroll}
        >
        {requests.length === 0 ? (
          <div className="sandbox-empty-state">Keine Anfragen vorhanden</div>
        ) : requests.map((request, index) => {
          const assignableSlots = getAssignableTimes(request);
          const groupedTimes = splitTimesByRequestedWindow(assignableSlots, request.requestedTime);
          const selectedAssignable = selectedAssignTimes[request.id] || '';
          const teacherMessage = teacherMessages[request.id] || '';
          const isParent = request.visitorType === 'parent';
          const accentClass = CARD_ACCENT_CLASSES[index % CARD_ACCENT_CLASSES.length];
          const contactName = isParent
            ? (request.parentName || '-')
            : [request.companyName || '-', request.representativeName ? `(${request.representativeName})` : '']
                .filter(Boolean)
                .join(' ');
          const personLabel = isParent ? (request.studentName || '-') : (request.traineeName || '-');
          const requestMessage = request.message || '-';
          const isExpandableMessage = requestMessage !== '-' && (requestMessage.length > 170 || requestMessage.includes('\n'));
          const isMessageExpanded = !!expandedMessageIds[request.id];

          return (
          <article key={request.id} className={`sandbox-card sandbox-slide ${accentClass} ${index === safeActiveIndex ? 'is-active' : ''}`}>
            <header className="sandbox-card__head">
              <div>
                  <span className="sandbox-request-indicator">{isParent ? 'Erziehungsberechtigte' : 'Ausbildungsbetrieb'}</span>
                  <h3 className="sandbox-card__name">{contactName}</h3>
                <p className="sandbox-card__datetime">{request.date}</p>
                <p className="sandbox-card__window">{request.requestedTime}</p>
                <p className="sandbox-card__meta">Eingegangen {formatCreatedAt(request.createdAt)}</p>
              </div>
            </header>

            <div className="sandbox-card__content">
              <dl className="sandbox-card__dl">
                <div className="sandbox-card__row">
                  <dt>Terminzeit</dt>
                  <dd>
                    <div className="sandbox-assign-group">
                      <select
                        className="sandbox-select"
                        value={selectedAssignable}
                        onChange={(event) => onAssignTimeChange(request.id, event.target.value)}
                        disabled={assignableSlots.length === 0}
                      >
                        <option value="" disabled>
                          Bitte Zeitslot auswählen, der vergeben werden soll.
                        </option>
                        <optgroup label="Innerhalb des angefragten Zeitraums">
                          {groupedTimes.inside.length > 0 ? (
                            groupedTimes.inside.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))
                          ) : (
                            <option value="__inside-empty" disabled>
                              Keine Zeiten
                            </option>
                          )}
                        </optgroup>
                        <optgroup label="Außerhalb des angefragten Zeitraums">
                          {groupedTimes.outside.length > 0 ? (
                            groupedTimes.outside.map((slot) => (
                              <option key={slot} value={slot}>
                                {slot}
                              </option>
                            ))
                          ) : (
                            <option value="__outside-empty" disabled>
                              Keine Zeiten
                            </option>
                          )}
                        </optgroup>
                      </select>
                    </div>
                  </dd>
                </div>
                <div className="sandbox-card__row">
                  <dt>Schüler*in/Azubi</dt>
                  <dd>{personLabel}</dd>
                </div>
                <div className="sandbox-card__row">
                  <dt>Klasse</dt>
                  <dd>{request.className}</dd>
                </div>
                <div className="sandbox-card__row">
                  <dt>Kontaktkanal</dt>
                  <dd>Mail</dd>
                </div>
                <div className="sandbox-card__row">
                  <dt>E-Mail</dt>
                  <dd>
                    <a className="sandbox-mail-link" href={`mailto:${request.email}`}>{request.email}</a>
                  </dd>
                </div>
              </dl>

              <div className="sandbox-card__message">
                <span>Eingegangene Nachricht</span>
                <p className={isMessageExpanded ? 'is-expanded' : ''}>{requestMessage}</p>
                {isExpandableMessage && (
                  <button
                    type="button"
                    className="sandbox-more"
                    onClick={() => {
                      setExpandedMessageIds((prev) => ({
                        ...prev,
                        [request.id]: !prev[request.id],
                      }));
                    }}
                  >
                    {isMessageExpanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                  </button>
                )}

                <div className="sandbox-card__teacher-note">
                  <span>Nachricht an den Ausbildungsbetrieb/Erziehungsberechtigten</span>
                  <textarea
                    className="sandbox-textarea"
                    value={teacherMessage}
                    onChange={(event) => onTeacherMessageChange(request.id, event.target.value)}
                    placeholder="Wird in der Bestätigungs-E-Mail angezeigt"
                    maxLength={1000}
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="sandbox-card__footer">
              <div className="sandbox-card__actions">
                <button
                  type="button"
                  className="sandbox-decline-btn"
                  onClick={() => onDeclineRequest(request.id)}
                >
                  Ablehnen
                </button>
                <button
                  type="button"
                  className="sandbox-action-btn"
                  onClick={() => onAcceptRequest(request.id, selectedAssignable || undefined)}
                  disabled={!request.verifiedAt || (assignableSlots.length > 0 && !selectedAssignable)}
                  title={
                    !request.verifiedAt
                      ? 'Erst möglich, wenn die E-Mail-Adresse bestätigt wurde'
                      : assignableSlots.length > 0 && !selectedAssignable
                        ? 'Bitte zuerst einen Zeitslot auswählen'
                        : undefined
                  }
                >
                  Termin vergeben
                </button>
              </div>
            </div>
          </article>
          );
        })}
        </div>

        {total > 0 && (
          <button
            type="button"
            className="sandbox-nav-btn sandbox-nav-arrow"
            aria-label="Nächste Anfrage"
            onClick={() => scrollToIndex(safeActiveIndex + 1)}
            disabled={safeActiveIndex >= total - 1}
          >
            {'>'}
          </button>
        )}
      </div>

      {total > 0 && (
        <div className="sandbox-carousel-dots" aria-hidden="true">
          {requests.map((request, index) => (
            <button
              key={request.id}
              type="button"
              className={`sandbox-dot ${index === safeActiveIndex ? 'is-active' : ''}`}
              onClick={() => scrollToIndex(index)}
              tabIndex={-1}
            />
          ))}
        </div>
      )}

      <div className="sandbox-table__skeleton" aria-hidden="true">
        {[1, 2, 3].map((idx) => (
          <div key={idx} className="sandbox-skeleton-row" />
        ))}
      </div>
    </div>
    </section>
  );
}
