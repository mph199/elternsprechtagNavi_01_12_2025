import { useEffect, useState } from 'react';

export function VerifyEmail() {
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>( 'idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Ungültiger Link.');
      return;
    }
    fetch(`/api/bookings/verify/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) {
          setStatus('ok');
          setMessage(data.message || 'E-Mail bestätigt.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Verifikation fehlgeschlagen.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Verifikation fehlgeschlagen.');
      });
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '24px', background: 'white', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <h2>E-Mail-Verifikation</h2>
      {status === 'idle' && <p>Bitte warten…</p>}
      {status === 'ok' && <p style={{ color: 'green' }}>{message}</p>}
      {status === 'error' && <p style={{ color: 'crimson' }}>{message}</p>}
    </div>
  );
}
