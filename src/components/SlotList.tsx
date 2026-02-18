import type { TimeSlot } from '../types';

interface SlotListProps {
  slots: TimeSlot[];
  selectedSlotId: number | null;
  selectedTeacherId: number | null;
  selectedTeacherName?: string | null;
  eventId: number | null;
  onSelectSlot: (slotId: number) => void;
}

export const SlotList = ({
  slots,
  selectedSlotId,
  selectedTeacherId,
  selectedTeacherName,
  eventId,
  onSelectSlot,
}: SlotListProps) => {
  const emptyMessage = !selectedTeacherId
    ? 'Bitte wählen Sie eine Lehrkraft aus, um Zeitfenster zu sehen.'
    : eventId === null
      ? 'Buchungen sind aktuell nicht freigeschaltet. Bitte versuchen Sie es später erneut.'
      : 'Für diese Lehrkraft sind aktuell keine Zeitfenster verfügbar. Bitte wählen Sie eine andere Lehrkraft oder versuchen Sie es später erneut.';

  const headline = selectedTeacherId && selectedTeacherName
    ? `Zeitfenster bei ${selectedTeacherName}`
    : 'Zeitfenster';

  return (
    <div className="slot-list" role="region" aria-label={headline}>
      <h2>{headline}</h2>
      <div className="slots-container" role="list">
        {slots.length === 0 ? (
          <p className="no-slots">
            {emptyMessage}
          </p>
        ) : (
          slots.map((slot) => (
            <button
              key={slot.id}
              className={`slot-card ${selectedSlotId === slot.id ? 'selected' : ''}`}
              type="button"
              onClick={() => onSelectSlot(slot.id)}
              role="listitem"
              aria-pressed={selectedSlotId === slot.id}
              aria-label={`Zeitfenster ${slot.time} am ${slot.date}`}
            >
              <div className="slot-kicker">Zeitraum</div>
              <div className="slot-time" aria-label="Zeitraum">
                {slot.time || 'Uhrzeit folgt'}
              </div>
              <div className="slot-meta" aria-label="Tag">
                <span className="slot-meta-label">Tag</span>
                <span className="slot-date">{slot.date || 'Datum folgt'}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
