import type { TimeSlot } from '../types';

interface SlotListProps {
  slots: TimeSlot[];
  selectedSlotId: number | null;
  onSelectSlot: (slotId: number) => void;
}

export const SlotList = ({
  slots,
  selectedSlotId,
  onSelectSlot,
}: SlotListProps) => {
  return (
    <div className="slot-list" role="region" aria-label="Verfügbare Termine">
      <h2>Verfügbare Termine</h2>
      <div className="slots-container" role="list">
        {slots.length === 0 ? (
          <p className="no-slots">
            Bitte wählen Sie eine Lehrkraft aus, um Termine zu sehen.
          </p>
        ) : (
          slots.map((slot) => (
            <div
              key={slot.id}
              className={`slot-card ${slot.booked ? 'booked' : 'available'} ${
                selectedSlotId === slot.id ? 'selected' : ''
              }`}
              onClick={() => !slot.booked && onSelectSlot(slot.id)}
              role="listitem button"
              tabIndex={slot.booked ? -1 : 0}
              aria-selected={selectedSlotId === slot.id}
              aria-disabled={slot.booked}
              aria-label={`Termin ${slot.time} am ${slot.date}${slot.booked ? ' - bereits gebucht' : ' - verfügbar'}`}
              onKeyDown={(e) => {
                if (!slot.booked && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectSlot(slot.id);
                }
              }}
            >
              <div className="slot-time">
                {slot.time}
              </div>
              <div className="slot-date">{slot.date}</div>
              {slot.booked ? (
                <div className="slot-status booked-status">
                  <span className="status-badge">Gebucht</span>
                </div>
              ) : (
                <div className="slot-status available-status">
                  <span className="status-badge">Verfügbar</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
