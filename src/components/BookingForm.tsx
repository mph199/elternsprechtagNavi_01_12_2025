import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BookingFormData } from '../types';

interface BookingFormProps {
  selectedSlotId: number | null;
  onSubmit: (formData: BookingFormData) => void;
  onCancel: () => void;
  message: string;
}

export const BookingForm = ({
  selectedSlotId,
  onSubmit,
  onCancel,
  message,
}: BookingFormProps) => {
  const [formData, setFormData] = useState<BookingFormData>({
    visitorType: 'parent',
    parentName: '',
    companyName: '',
    studentName: '',
    traineeName: '',
    className: '',
    email: '',
    message: '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    // Validierung basierend auf Besuchertyp
    if (formData.visitorType === 'parent') {
      if (!formData.parentName || !formData.studentName || !formData.className || !formData.email) {
        return;
      }
    } else {
      if (!formData.companyName || !formData.traineeName || !formData.className || !formData.email) {
        return;
      }
    }

    onSubmit(formData);
    
    // Reset form after successful submission
    setFormData({
      visitorType: 'parent',
      parentName: '',
      companyName: '',
      studentName: '',
      traineeName: '',
      className: '',
      email: '',
      message: '',
    });
  };

  const handleCancel = () => {
    setFormData({
      visitorType: 'parent',
      parentName: '',
      companyName: '',
      studentName: '',
      traineeName: '',
      className: '',
      email: '',
      message: '',
    });
    onCancel();
  };

  if (!selectedSlotId) {
    return null;
  }

  return (
    <div className="booking-form-container" role="region" aria-label="Buchungsformular">
      <h2>Termin buchen</h2>
      <form onSubmit={handleSubmit} className="booking-form" aria-label="Termin buchen">
        <div className="form-group">
          <label htmlFor="visitorType">Besuchertyp</label>
          <select
            id="visitorType"
            value={formData.visitorType}
            onChange={(e) =>
              setFormData({ ...formData, visitorType: e.target.value as 'parent' | 'company' })
            }
            required
          >
            <option value="parent">👨‍👩‍👧 Erziehungsberechtigte</option>
            <option value="company">🏢 Ausbildungsbetrieb</option>
          </select>
        </div>

        {formData.visitorType === 'parent' ? (
          <>
            <div className="form-group">
              <label htmlFor="parentName">Name der Erziehungsberechtigten</label>
              <input
                type="text"
                id="parentName"
                value={formData.parentName || ''}
                onChange={(e) =>
                  setFormData({ ...formData, parentName: e.target.value })
                }
                placeholder="z.B. Familie Müller"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="studentName">Name des Schülers/der Schülerin</label>
              <input
                type="text"
                id="studentName"
                value={formData.studentName || ''}
                onChange={(e) =>
                  setFormData({ ...formData, studentName: e.target.value })
                }
                placeholder="z.B. Max Müller"
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label htmlFor="companyName">Name des Ausbildungsbetriebs</label>
              <input
                type="text"
                id="companyName"
                value={formData.companyName || ''}
                onChange={(e) =>
                  setFormData({ ...formData, companyName: e.target.value })
                }
                placeholder="z.B. Firma Mustermann GmbH"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="traineeName">Name des Auszubildenden</label>
              <input
                type="text"
                id="traineeName"
                value={formData.traineeName || ''}
                onChange={(e) =>
                  setFormData({ ...formData, traineeName: e.target.value })
                }
                placeholder="z.B. Max Mustermann"
                required
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label htmlFor="className">Klasse</label>
          <input
            type="text"
            id="className"
            value={formData.className}
            onChange={(e) =>
              setFormData({ ...formData, className: e.target.value })
            }
            placeholder="z.B. 5a"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">E-Mail</label>
          <input
            type="email"
            id="email"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            placeholder="ihre.email@beispiel.de"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Nachricht an die Lehrkraft (optional)</label>
          <textarea
            id="message"
            value={formData.message || ''}
            onChange={(e) =>
              setFormData({ ...formData, message: e.target.value })
            }
            placeholder="Optionale Nachricht..."
            rows={3}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Termin buchen
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            Abbrechen
          </button>
        </div>
      </form>

      {message && (
        <div 
          className={`message ${message.includes('erfolgreich') ? 'success' : 'error'}`}
          role="alert"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </div>
  );
};
